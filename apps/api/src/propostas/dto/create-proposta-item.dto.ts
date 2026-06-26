import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Criação de um item da planilha de preços (BACKLOG T-61). Só a descrição é
// obrigatória; o preço unitário costuma ser preenchido depois (T-68). O item é
// adicionado ao fim da proposta (ordem calculada no service).
export class CreatePropostaItemDto {
  @IsString()
  @MaxLength(2000)
  descricao!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidade?: string;

  // Quantitativo. numeric(15,4) — aceita frações/coeficientes.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(99_999_999_999.9999)
  quantidade?: number;

  // Preço unitário em reais. numeric(15,2).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999_999.99)
  precoUnitario?: number;
}
