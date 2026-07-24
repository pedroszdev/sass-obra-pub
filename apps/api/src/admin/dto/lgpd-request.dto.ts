import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  LGPD_STATUS,
  LGPD_TIPOS,
  LgpdStatus,
  LgpdTipo,
} from '../lgpd-request.entity';

// Registra uma solicitação de titular (T-196) — normalmente uma que chegou por
// e-mail, fora do app.
export class CreateLgpdRequestDto {
  @IsIn(LGPD_TIPOS)
  tipo!: LgpdTipo;

  @IsEmail()
  @MaxLength(255)
  requesterEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  // Conta ligada, se identificada — opcional (o pedido pode vir de fora).
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class ListLgpdDto {
  @IsOptional()
  @IsIn(LGPD_STATUS)
  status?: LgpdStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class UpdateLgpdRequestDto {
  @IsIn(LGPD_STATUS)
  status!: LgpdStatus;

  // Registro do atendimento/recusa — a prova de como foi resolvido.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolucao?: string;
}
