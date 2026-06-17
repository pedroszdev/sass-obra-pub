import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  EditalSearchResult,
  toEditalListItem,
} from './dto/edital-search-response';
import { SearchEditaisDto } from './dto/search-editais.dto';
import { Edital } from './edital.entity';

const DEFAULT_PAGE_SIZE = 20;

// Traduz os filtros do DTO em condições do TypeORM. Pura e isolada para ser
// testável sem banco. Sempre fixa `isObra: true` — a busca só mostra obras
// (nota da T-15). Filtros de valor (T-21) e textual (T-22) entram aqui depois.
export function buildEditalWhere(
  dto: SearchEditaisDto,
): FindOptionsWhere<Edital> {
  const where: FindOptionsWhere<Edital> = { isObra: true };

  if (dto.uf) {
    where.uf = dto.uf;
  }
  if (dto.codigoIbge) {
    where.codigoIbge = dto.codigoIbge;
  }

  const inicio = dto.dataInicio ? new Date(dto.dataInicio) : undefined;
  const fim = dto.dataFim ? new Date(dto.dataFim) : undefined;
  if (inicio && fim) {
    where.dataPublicacao = Between(inicio, fim);
  } else if (inicio) {
    where.dataPublicacao = MoreThanOrEqual(inicio);
  } else if (fim) {
    where.dataPublicacao = LessThanOrEqual(fim);
  }

  return where;
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
