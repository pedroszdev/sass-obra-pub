import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PropostaStatus } from '../proposta-status.enum';
import { EtapaCronogramaDto } from './etapa-cronograma.dto';

// Edição de proposta (BACKLOG T-61). Todos os campos opcionais — merge só do que
// for enviado. Não permite trocar o edital (a proposta é vinculada a um edital
// fixo). Escrito à mão (sem PartialType) para não trazer dep nova.
export class UpdatePropostaDto {
  // ValidateIf (não IsOptional) em campos de coluna NOT NULL: IsOptional deixa
  // `null` explícito passar e virar 500 no banco (T-117e). Assim `null` é
  // validado (e rejeitado) e só a AUSÊNCIA (undefined) é ignorada.
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @MaxLength(255)
  titulo?: string;

  @ValidateIf((_, v) => v !== undefined)
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

  // Cronograma físico-financeiro simples (T-93). Substitui o conjunto de etapas.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(36)
  @ValidateNested({ each: true })
  @Type(() => EtapaCronogramaDto)
  cronograma?: EtapaCronogramaDto[];
}
