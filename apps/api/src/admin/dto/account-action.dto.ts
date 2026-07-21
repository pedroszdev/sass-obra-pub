import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// Dias de uma concessão do admin (T-185): estender trial ou conceder cortesia.
// 1..365 — evita concessão eterna por dedo escorregado.
export class AccountActionDiasDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dias!: number;
}
