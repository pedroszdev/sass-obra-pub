import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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

// Ordenações da busca (T-81). `recentes` é o default (publicação mais nova
// primeiro); `prazo` põe o prazo mais próximo na frente (sem prazo vai pro fim);
// `valor` traz os de maior valor estimado primeiro (sem valor vai pro fim).
export const EDITAL_SORTS = ['recentes', 'prazo', 'valor'] as const;
export type EditalSort = (typeof EDITAL_SORTS)[number];

// Coage o param `modalidade` (string | string[] na query) em number[]. Aceita
// `?modalidade=4&modalidade=5` (array) ou `?modalidade=4` (escalar). Descarta o
// que não for inteiro — a validação abaixo cuida do resto.
function toModalidadeArray(value: unknown): number[] | undefined {
  if (value == null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => Number(v)).filter((n) => Number.isInteger(n));
}

// Coage um param de texto (string | string[]) em string[], aplicando `map` em
// cada item e descartando vazios. Aceita `?uf=SC&uf=PR` (array) ou `?uf=SC`
// (escalar). T-81: UF e município passam a aceitar múltiplos valores.
function toStringArray(
  value: unknown,
  map: (s: string) => string = (s) => s,
): string[] | undefined {
  if (value == null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .filter((v): v is string => typeof v === 'string')
    .map((v) => map(v.trim()))
    .filter((v) => v !== '');
}

// Filtros da busca de editais (T-20 + T-21 + T-22). Campos desta fase:
// UF, município (codigoIbge), período de publicação, faixa de valor,
// busca textual no objeto e paginação.
export class SearchEditaisDto {
  // Região do edital (T-81: uma ou várias UFs). Normaliza para maiúsculas.
  // `?uf=SC` (escalar) e `?uf=SC&uf=PR` (array) viram ambos um array; `IN (...)`
  // na busca. Retrocompatível com o valor único de antes.
  @IsOptional()
  @Transform(({ value }) => toStringArray(value, (s) => s.toUpperCase()))
  @IsArray()
  @ArrayMaxSize(27)
  @IsIn(UFS, { each: true })
  uf?: Uf[];

  // Busca textual no objeto do edital (T-22). Full-text PT via
  // plainto_tsquery sobre a coluna tsvector `objetoBusca` (índice GIN).
  // Várias palavras viram AND. Vazio/só espaços = sem filtro.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  q?: string;

  // Modalidade de contratação do PNCP (T-80). Hoje a captação só traz
  // Concorrência: 4 (Eletrônica) e 5 (Presencial) — o filtro do front separa
  // essas duas. IDs canônicos do PNCP; vazio = todas. Vira `IN (...)` na busca.
  @IsOptional()
  @Transform(({ value }) => toModalidadeArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(1, { each: true })
  modalidade?: number[];

  // Município padronizado pelo código IBGE (7 dígitos) — chave estável que o
  // front manda a partir de um seletor. T-81: aceita um ou vários (`IN`).
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^\d{7}$/, {
    each: true,
    message: 'codigoIbge deve conter 7 dígitos',
  })
  codigoIbge?: string[];

  // Ordenação (T-81). Default `recentes` quando ausente/!inválido.
  @IsOptional()
  @IsIn(EDITAL_SORTS)
  sort?: EditalSort;

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
