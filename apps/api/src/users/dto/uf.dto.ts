import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { UFS, Uf } from '../../common/uf';

// Define a UF de atuação (T-126). O cadastro local já exige UF (RegisterDto), mas
// a conta criada pelo Google nasce sem ela — e sem UF a captação (T-18) não roda.
// O onboarding (T-108) usa este endpoint para coletá-la.
export class UfDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(UFS)
  uf!: Uf;
}
