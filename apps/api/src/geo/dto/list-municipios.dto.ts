import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { UFS, Uf } from '../../common/uf';

// Query de GET /geo/municipios. A UF é obrigatória — o seletor sempre lista os
// municípios de um estado. Normaliza para maiúsculas antes de validar.
export class ListMunicipiosDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(UFS)
  uf!: Uf;
}
