import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { AssinaturaStatus } from '../../assinaturas/assinatura-status.enum';

export class ListBillingDto {
  @IsOptional()
  @IsEnum(AssinaturaStatus)
  status?: AssinaturaStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
