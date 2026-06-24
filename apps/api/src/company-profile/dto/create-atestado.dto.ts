import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Criação de um atestado de capacidade técnica (BACKLOG T-41). Só a descrição
// (objeto/tipo de obra) é obrigatória; o resto qualifica o porte da obra.
export class CreateAtestadoDto {
  @IsString()
  @MaxLength(2000)
  descricao!: string;

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
