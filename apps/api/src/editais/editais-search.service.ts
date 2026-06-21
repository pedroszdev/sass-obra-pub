import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOperator,
  FindOptionsWhere,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Raw,
  Repository,
} from 'typeorm';
import {
  EditalSearchResult,
  toEditalListItem,
} from './dto/edital-search-response';
import { SearchEditaisDto } from './dto/search-editais.dto';
import { Edital } from './edital.entity';

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
  ) {}

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

    return {
      data: rows.map(toEditalListItem),
      total,
      page,
      pageSize,
    };
  }
}
