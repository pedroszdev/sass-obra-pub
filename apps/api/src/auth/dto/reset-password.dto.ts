import { IsString, MinLength } from 'class-validator';
import { IsSenhaForte } from '../../common/senha';

// Redefinição de senha via token do e-mail (T-101).
export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  // Política de senha forte (T-153): 8–72, maiúscula, minúscula, número e
  // especial. O teto de 72 (bcrypt trunca acima) já vive dentro de @IsSenhaForte.
  @IsString()
  @IsSenhaForte()
  novaSenha!: string;
}
