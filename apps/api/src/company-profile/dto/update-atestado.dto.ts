import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Edição de atestado (BACKLOG T-41). Todos os campos opcionais — merge só do que
// for enviado. Escrito à mão (sem PartialType) para não trazer dep nova.
export class UpdateAtestadoDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999_999.99)
  quantitativo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidade?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999_999.99)
  valor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contratante?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  ano?: number;
}
