import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UFS, Uf } from '../../common/uf';

// Filtros da busca de editais (T-20 + T-21 + T-22). Campos desta fase:
// UF, município (codigoIbge), período de publicação, faixa de valor,
// busca textual no objeto e paginação.
export class SearchEditaisDto {
  // Região do edital. Normaliza para maiúsculas antes de validar.
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(UFS)
  uf?: Uf;

  // Busca textual no objeto do edital (T-22). Full-text PT via
  // plainto_tsquery sobre a coluna tsvector `objetoBusca` (índice GIN).
  // Várias palavras viram AND. Vazio/só espaços = sem filtro.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  q?: string;

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

  // Faixa de valor estimado, em reais (T-21). Filtro livre — a UI monta os
  // presets de porte (ex.: teto R$80k do benefício ME/EPP, ver ME_EPP_VALOR_LIMITE).
  // Editais sem valor estimado entram mesmo com a faixa aplicada (favor recall).
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorMax?: number;

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
