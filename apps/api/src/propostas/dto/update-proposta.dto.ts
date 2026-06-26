import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PropostaStatus } from '../proposta-status.enum';

// Edição de proposta (BACKLOG T-61). Todos os campos opcionais — merge só do que
// for enviado. Não permite trocar o edital (a proposta é vinculada a um edital
// fixo). Escrito à mão (sem PartialType) para não trazer dep nova.
export class UpdatePropostaDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  titulo?: string;

  @IsOptional()
  @IsEnum(PropostaStatus)
  status?: PropostaStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  bdiPercentual?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999_999.99)
  valorReferencia?: number;
}
