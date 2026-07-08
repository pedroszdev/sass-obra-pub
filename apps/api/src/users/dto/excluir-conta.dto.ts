import { IsString, MinLength } from 'class-validator';

// Confirmação da exclusão de conta (T-102/LGPD): exige a senha atual.
export class ExcluirContaDto {
  @IsString()
  @MinLength(1)
  senha!: string;
}
