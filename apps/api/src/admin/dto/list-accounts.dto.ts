import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AssinaturaStatus } from '../../assinaturas/assinatura-status.enum';

// Filtros da lista de contas do admin (T-184). Todos opcionais; paginação no
// padrão do SearchEditaisDto.
export class ListAccountsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnpj?: string;

  @IsOptional()
  @IsEnum(AssinaturaStatus)
  status?: AssinaturaStatus;

  // '1'/'true' → true, '0'/'false' → false (query string é texto).
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === '1'
      ? true
      : value === 'false' || value === '0'
        ? false
        : value,
  )
  @IsBoolean()
  emailVerificado?: boolean;

  @IsOptional()
  @IsISO8601()
  cadastradoDe?: string;

  @IsOptional()
  @IsISO8601()
  cadastradoAte?: string;

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
