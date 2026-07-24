import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  BROADCAST_SEGMENTOS,
  BroadcastSegmento,
} from '../beta-broadcast.entity';

// Envia um comunicado ao beta (T-198).
export class SendBroadcastDto {
  @IsIn(BROADCAST_SEGMENTOS)
  segmento!: BroadcastSegmento;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  assunto!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  corpo!: string;
}

export class PreviewBroadcastDto {
  @IsIn(BROADCAST_SEGMENTOS)
  segmento!: BroadcastSegmento;
}

export class ListBroadcastDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;
}
