import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOperator,
  FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
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
import { SearchEditaisDto } from './dto/search-editais.dto';
import { Edital } from './edital.entity';
import {
  EditalExigencias,
  ExigenciasStatus,
} from './exigencias/edital-exigencias.entity';
import { ExigenciasHabilitacao } from './exigencias/exigencias.types';
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
): FindOptionsWhere<Edital> | FindOptionsWhere<Edital>[] {
  const base: FindOptionsWhere<Edital> = { isObra: true };

  if (dto.uf) {
    base.uf = dto.uf;
  }
  if (dto.codigoIbge) {
    base.codigoIbge = dto.codigoIbge;
  }

  // Modalidade (T-80): IN sobre os ids do PNCP. Entra no `base` antes do split
  // por faixa de valor, então vale também no caso OR (array de where).
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

    // Ordena por recentes primeiro; `id` como desempate para paginação estável.
    const [rows, total] = await this.editais.findAndCount({
      where: buildEditalWhere(dto),
      order: { dataPublicacao: 'DESC', id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Captação sob demanda (T-34): se a busca é por uma UF específica ainda não
    // captada (ou com dado velho), dispara a captação dela em segundo plano e
    // sinaliza para a UI. Só com UF — sem UF significaria "captar tudo".
    const capturing = dto.uf
      ? await this.ufCapture.triggerUfIfStale(dto.uf)
      : false;

    return {
      data: rows.map(toEditalListItem),
      total,
      page,
      pageSize,
      capturing,
    };
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
