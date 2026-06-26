import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Criação de uma proposta para um edital (BACKLOG T-61). status nasce sempre
// rascunho (não é aceito aqui — vira finalizada via PUT). valorReferencia é
// opcional: se ausente, o service copia o valor estimado do edital (snapshot).
export class CreatePropostaDto {
  @IsString()
  @MaxLength(255)
  titulo!: string;

  @IsUUID()
  editalId!: string;

  // BDI em pontos percentuais (ex.: 25.5 = 25,5%).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  bdiPercentual?: number;

  // Teto de referência em reais. numeric(15,2).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999_999.99)
  valorReferencia?: number;
}
