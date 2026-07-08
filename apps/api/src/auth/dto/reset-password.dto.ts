import { IsString, MaxLength, MinLength } from 'class-validator';

// Redefinição de senha via token do e-mail (T-101).
export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  // bcrypt trunca acima de 72 bytes — mesmo limite do cadastro.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  novaSenha!: string;
}
