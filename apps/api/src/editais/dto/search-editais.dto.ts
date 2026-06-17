import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsIn,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { UFS, Uf } from '../../common/uf';

// Filtros da busca de editais (T-20). Só os campos desta fase:
// UF, município (codigoIbge), período de publicação e paginação.
// Faixa de valor entra na T-21; busca textual no objeto na T-22.
export class SearchEditaisDto {
  // Região do edital. Normaliza para maiúsculas antes de validar.
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(UFS)
  uf?: Uf;

  // Município padronizado pelo código IBGE (7 dígitos) — chave estável que o
  // front manda a partir de um seletor. Resolução nome→código fica para um
  // endpoint geo futuro.
  @IsOptional()
  @Matches(/^\d{7}$/, { message: 'codigoIbge deve conter 7 dígitos' })
  codigoIbge?: string;

  // Período pela data de publicação (inclusivo nas pontas). Comparado como
  // instante — o front pode mandar data ou data-hora ISO.
  @IsOptional()
  @IsISO8601()
  dataInicio?: string;

  @IsOptional()
  @IsISO8601()
  dataFim?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
