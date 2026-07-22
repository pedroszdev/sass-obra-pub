import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const TIPOS = ['resumo', 'exigencias', 'itens'] as const;

export class ListIaOutputsDto {
  @IsOptional()
  @IsIn(TIPOS)
  tipo?: (typeof TIPOS)[number];

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

export class ReviewIaOutputDto {
  @IsIn(TIPOS)
  tipo!: (typeof TIPOS)[number];

  @IsUUID()
  editalId!: string;

  @IsIn(['ok', 'errado'])
  veredito!: 'ok' | 'errado';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
