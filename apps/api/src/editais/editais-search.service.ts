import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOperator,
  FindOptionsOrder,
  FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Raw,
  Repository,
} from 'typeorm';
import {
  EditalDetail,
  EditalListItem,
  EditalSearchResult,
  toEditalDetail,
  toEditalListItem,
} from './dto/edital-search-response';
import { EditalSort, SearchEditaisDto } from './dto/search-editais.dto';
import { Edital } from './edital.entity';
import {
  EditalExigencias,
  ExigenciasStatus,
} from './exigencias/edital-exigencias.entity';
import { ExigenciasHabilitacao } from './exigencias/exigencias.types';
import { situacaoAtivaWhere } from './situacao';
import { UfCaptureService } from './uf-capture.service';

const DEFAULT_PAGE_SIZE = 20;

// Condição de intervalo [min, max] (qualquer ponta opcional). Serve para
// período (Date) e faixa de valor (number). `undefined` = sem filtro.
function rangeCondition<T>(
  min: T | undefined,
  max: T | undefined,
): FindOperator<T> | undefined {
  if (min !== undefined && max !== undefined) {
    return Between(min, max);
  }
  if (min !== undefined) {
    return MoreThanOrEqual(min);
  }
  if (max !== undefined) {
    return LessThanOrEqual(max);
  }
  return undefined;
}

// Fragmento SQL da busca textual (T-22): casa o tsvector `objeto_busca` com a
// query do usuário via full-text PT. `:q` é parâmetro nomeado (não interpolado)
// — sem risco de injeção. Usa o índice GIN criado na T-07.
export const OBJETO_BUSCA_SQL = (alias: string): string =>
  `${alias} @@ plainto_tsquery('portuguese', :q)`;

// Traduz os filtros do DTO em condições do TypeORM. Pura e isolada para ser
// testável sem banco. Sempre fixa `isObra: true` — a busca só mostra obras
// (nota da T-15).
export function buildEditalWhere(
  dto: SearchEditaisDto,
  now: Date = new Date(),
): FindOptionsWhere<Edital> | FindOptionsWhere<Edital>[] {
  // Sempre obra (T-15) e sempre "em jogo" (T-114): anulado/revogado/suspenso não
  // é oportunidade — some da busca por padrão (decisão do dono). O detalhe por id
  // (findById) não passa por aqui, então um favorito morto ainda abre com badge.
  const base: FindOptionsWhere<Edital> = {
    isObra: true,
    situacao: situacaoAtivaWhere(),
  };

  // UF e município (T-81): uma ou várias → IN. Entram no `base` antes do split
  // por faixa de valor, então valem também no caso OR (array de where).
  if (dto.uf?.length) {
    base.uf = dto.uf.length === 1 ? dto.uf[0] : In(dto.uf);
  }
  if (dto.codigoIbge?.length) {
    base.codigoIbge =
      dto.codigoIbge.length === 1 ? dto.codigoIbge[0] : In(dto.codigoIbge);
  }

  // Modalidade (T-80): IN sobre os ids do PNCP.
  if (dto.modalidade?.length) {
    base.modalidadeId = In(dto.modalidade);
  }

  // Busca textual no objeto (T-22). `q` já vem trim do DTO; ignora se vazio.
  if (dto.q) {
    base.objetoBusca = Raw(OBJETO_BUSCA_SQL, { q: dto.q });
  }

  const periodo = rangeCondition(
    dto.dataInicio ? new Date(dto.dataInicio) : undefined,
    dto.dataFim ? new Date(dto.dataFim) : undefined,
  );
  if (periodo) {
    base.dataPublicacao = periodo;
  }

  // Só abertos (T-114): pedido explicitamente OU implícito no sort=prazo — uma
  // ordenação de urgência não pode liderar com prazos já vencidos. Derruba só os
  // encerrados POR DATA; mantém os sem prazo (null = desconhecido, favor recall).
  // Nota: exclusão por SITUAÇÃO (anulado/revogado) depende da re-sincronização
  // do PNCP (mesmo escopo T-114) — a situação no banco hoje congela na captação.
  if (dto.somenteAbertos || dto.sort === 'prazo') {
    base.prazoProposta = Raw(
      (alias) => `(${alias} >= :agora OR ${alias} IS NULL)`,
      { agora: now },
    );
  }

  // Faixa de valor (T-21): editais sem valor estimado (null) entram mesmo com
  // a faixa aplicada — favor recall. Vira um OR (array de where).
  const valor = rangeCondition(dto.valorMin, dto.valorMax);
  if (!valor) {
    return base;
  }
  return [
    { ...base, valorEstimado: valor },
    { ...base, valorEstimado: IsNull() },
  ];
}

// Traduz o `sort` do DTO em ordem do TypeORM (T-81). Pura e testável. `id` DESC
// sempre como desempate (paginação estável). Os campos nullable (prazo, valor)
// mandam os nulos pro fim — quem não tem prazo/valor não atrapalha o topo.
export function buildEditalOrder(sort?: EditalSort): FindOptionsOrder<Edital> {
  switch (sort) {
    case 'prazo':
      return {
        prazoProposta: { direction: 'ASC', nulls: 'LAST' },
        id: 'DESC',
      };
    case 'valor':
      return {
        valorEstimado: { direction: 'DESC', nulls: 'LAST' },
        id: 'DESC',
      };
    case 'recentes':
    default:
      return { dataPublicacao: 'DESC', id: 'DESC' };
  }
}

@Injectable()
export class EditaisSearchService {
  constructor(
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    @InjectRepository(EditalExigencias)
    private readonly exigenciasRepo: Repository<EditalExigencias>,
    private readonly ufCapture: UfCaptureService,
  ) {}

  // Paginação por OFFSET (skip/take). Revisado na T-24: com a captação
  // orientada à demanda (T-18) a base por UF é pequena e o usuário refina
  // filtro em vez de paginar fundo, então o custo do OFFSET (varrer+descartar)
  // não pesa. Se o volume crescer a ponto de páginas profundas doerem, migrar
  // para cursor sobre (dataPublicacao, id) — é mudança de contrato da API
  // (troca page/total por nextCursor), por isso fica como melhoria futura.
  async search(dto: SearchEditaisDto): Promise<EditalSearchResult> {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? DEFAULT_PAGE_SIZE;

    // Ordena conforme o sort (T-81); default recentes. `id` desempata (estável).
    const [rows, total] = await this.editais.findAndCount({
      where: buildEditalWhere(dto),
      order: buildEditalOrder(dto.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Captação sob demanda (T-34): para cada UF buscada ainda não captada (ou
    // com dado velho), dispara a captação dela em segundo plano e sinaliza para
    // a UI. Sem UF significaria "captar tudo", então não dispara. `triggerUfIfStale`
    // é dedup por UF e não bloqueia — disparar várias é seguro (T-81 multi-UF).
    let capturing = false;
    for (const uf of dto.uf ?? []) {
      if (await this.ufCapture.triggerUfIfStale(uf)) capturing = true;
    }

    // Status do resumo IA (T-83): marca quais editais DESTA página já têm resumo
    // no cache. Só lê (resumo IS NOT NULL) — NUNCA dispara IA (§3.4). Uma query
    // por página; o conjunto é pequeno (pageSize).
    const resumoProntos = await this.resumosProntos(rows.map((r) => r.id));

    return {
      data: rows.map((r) => toEditalListItem(r, resumoProntos.has(r.id))),
      total,
      page,
      pageSize,
      capturing,
    };
  }

  // Subconjunto de `editalIds` que já têm resumo IA pronto no cache (T-83).
  private async resumosProntos(editalIds: string[]): Promise<Set<string>> {
    if (editalIds.length === 0) return new Set();
    const comResumo = await this.exigenciasRepo.find({
      where: { editalId: In(editalIds), resumo: Not(IsNull()) },
      select: { editalId: true },
    });
    return new Set(comResumo.map((e) => e.editalId));
  }

  // Editais que casam os filtros base E têm exigências já extraídas por IA
  // (T-49) — base do filtro de aptidão (T-53). SEM IA: lê só do cache (§3.4).
  // O conjunto é pequeno (captação por demanda + só os já analisados), então
  // devolve todos os candidatos; quem filtra por veredito/pagina é o T-51/T-53.
  async findEditaisComExigencias(
    dto: SearchEditaisDto,
  ): Promise<
    Array<{ edital: EditalListItem; exigencias: ExigenciasHabilitacao }>
  > {
    const extraidos = await this.exigenciasRepo.find({
      where: { status: ExigenciasStatus.EXTRAIDO },
      select: { editalId: true, exigencias: true },
    });
    const porEdital = new Map(
      extraidos
        .filter((e) => e.exigencias)
        .map((e) => [e.editalId, e.exigencias as ExigenciasHabilitacao]),
    );
    if (porEdital.size === 0) return [];
    const ids = [...porEdital.keys()];

    // Reusa o where da busca (T-20–T-22) e adiciona o recorte aos extraídos.
    const base = buildEditalWhere(dto);
    const where = (Array.isArray(base) ? base : [base]).map((w) => ({
      ...w,
      id: In(ids),
    }));
    const editais = await this.editais.find({
      where,
      order: { dataPublicacao: 'DESC', id: 'DESC' },
    });
    return editais.map((e) => ({
      edital: toEditalListItem(e),
      exigencias: porEdital.get(e.id) as ExigenciasHabilitacao,
    }));
  }

  // Detalhe por id (T-23). Acesso direto — sem filtro de `isObra`. 404 se não
  // existir. Inclui o `linkOrigem` para o documento na fonte.
  async findById(id: string): Promise<EditalDetail> {
    const edital = await this.editais.findOne({ where: { id } });
    if (!edital) {
      throw new NotFoundException('Edital não encontrado');
    }
    return toEditalDetail(edital);
  }
}
