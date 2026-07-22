import { IsISO8601, IsOptional } from 'class-validator';

// Filtro do painel de buscas (T-199): período.
export class ListBuscasDto {
  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  ate?: string;
}
