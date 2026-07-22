import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOperator,
  FindOptionsOrder,
  FindOptionsSelect,
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
    // Curadoria (T-197): despublicado some da busca. O detalhe por id ainda abre.
    oculto: false,
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

const CACHE_ABERTOS_MS = 5 * 60_000;

// Colunas que o EditalListItem realmente usa. Sem isto o `find` traz também o
// `rawPayload` (dump cru da fonte, jsonb pesado) e o `objetoBusca` (tsvector) —
// bytes que o toEditalListItem descarta em seguida.
const COLUNAS_LISTA: FindOptionsSelect<Edital> = {
  id: true,
  fonte: true,
  orgaoNome: true,
  orgaoCnpj: true,
  uf: true,
  municipioNome: true,
  codigoIbge: true,
  objeto: true,
  modalidadeNome: true,
  valorEstimado: true,
  dataPublicacao: true,
  prazoProposta: true,
  linkOrigem: true,
  situacao: true,
  isObra: true,
};

// Teto de candidatos do filtro de aptidão (T-53). O cruzamento perfil × exigências
// roda em memória, então o conjunto precisa ser limitado por construção — e não
// pelo acaso de a base ainda ser pequena. Recentes primeiro (a ordem que o filtro
// devolve de qualquer jeito), então o que fica de fora do teto é o mais antigo.
const MAX_CANDIDATOS_APTIDAO = 1000;

@Injectable()
export class EditaisSearchService {
  // Contagem pública de editais abertos (tela de login). O número muda no ritmo
  // da captação (diária), então 5 min de cache é folgado e evita que uma rota
  // sem autenticação vire um COUNT por visita.
  private cacheAbertos: { total: number; expiraEm: number } | null = null;

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
  // Quem filtra por veredito e pagina é o T-51/T-53.
  //
  // A ORDEM DAS DUAS QUERIES IMPORTA. Os editais vêm primeiro, já recortados
  // pelos filtros (região, valor, período), e só então buscamos as exigências
  // DESSES editais. O contrário — varrer `edital_exigencias` inteira e cruzar
  // por id depois — carregava o jsonb de todo edital já analisado do Brasil na
  // memória, em toda busca "estou apto" E uma vez POR USUÁRIO no job diário de
  // notificações (T-103/T-135). Com a base crescendo (captação por demanda em
  // UFs novas), era caminho de OOM no free tier. Não inverta de volta.
  async findEditaisComExigencias(
    dto: SearchEditaisDto,
  ): Promise<
    Array<{ edital: EditalListItem; exigencias: ExigenciasHabilitacao }>
  > {
    const editais = await this.editais.find({
      where: buildEditalWhere(dto),
      order: { dataPublicacao: 'DESC', id: 'DESC' },
      select: COLUNAS_LISTA,
      take: MAX_CANDIDATOS_APTIDAO,
    });
    if (editais.length === 0) return [];

    const extraidos = await this.exigenciasRepo.find({
      where: {
        editalId: In(editais.map((e) => e.id)),
        status: ExigenciasStatus.EXTRAIDO,
      },
      select: { editalId: true, exigencias: true },
    });
    const porEdital = new Map(
      extraidos
        .filter((e) => e.exigencias)
        .map((e) => [e.editalId, e.exigencias as ExigenciasHabilitacao]),
    );
    if (porEdital.size === 0) return [];

    // Edital sem exigências extraídas fica de fora: não há o que cruzar.
    return editais
      .filter((e) => porEdital.has(e.id))
      .map((e) => ({
        edital: toEditalListItem(e),
        exigencias: porEdital.get(e.id) as ExigenciasHabilitacao,
      }));
  }

  // Detalhe por id (T-23). Acesso direto — sem filtro de `isObra`. 404 se não
  // existir. Inclui o `linkOrigem` para o documento na fonte.
  // Quantos editais de obra estão ABERTOS agora (rota pública da tela de login).
  // Mesmos critérios da busca: `isObra`, situação ativa (T-114) e prazo no futuro
  // — ou nulo, que é "desconhecido", pelo favor-recall do §3.3. Sem filtro de
  // região: o número é do Brasil inteiro, mas só do que a captação orientada à
  // demanda (T-18) já trouxe. Cacheado em memória para não virar vetor de carga.
  async contarAbertos(now: Date = new Date()): Promise<number> {
    const cache = this.cacheAbertos;
    if (cache && cache.expiraEm > now.getTime()) {
      return cache.total;
    }
    const total = await this.editais.count({
      where: {
        isObra: true,
        situacao: situacaoAtivaWhere(),
        prazoProposta: Raw(
          (alias) => `(${alias} >= :agora OR ${alias} IS NULL)`,
          { agora: now },
        ),
      },
    });
    this.cacheAbertos = {
      total,
      expiraEm: now.getTime() + CACHE_ABERTOS_MS,
    };
    return total;
  }

  async findById(id: string): Promise<EditalDetail> {
    const edital = await this.editais.findOne({ where: { id } });
    if (!edital) {
      throw new NotFoundException('Edital não encontrado');
    }
    return toEditalDetail(edital);
  }
}
