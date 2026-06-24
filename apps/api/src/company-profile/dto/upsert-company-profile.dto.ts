import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UFS, Uf } from '../../common/uf';
import { RegistroProfissionalTipo } from '../registro-profissional-tipo.enum';

// Escalares do perfil de habilitação (BACKLOG T-41). Todos opcionais — o
// empreiteiro preenche aos poucos; o PUT faz merge só dos campos enviados.
export class UpsertCompanyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  razaoSocial?: string;

  // numeric(15,2): teto de 13 dígitos inteiros (evita overflow 22003 no Postgres).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999_999.99)
  capitalSocial?: number;

  @IsOptional()
  @IsEnum(RegistroProfissionalTipo)
  registroProfissionalTipo?: RegistroProfissionalTipo;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  registroProfissionalNumero?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(UFS)
  registroProfissionalUf?: Uf;
}
