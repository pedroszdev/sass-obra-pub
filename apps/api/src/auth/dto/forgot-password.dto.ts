import { IsEmail, MaxLength } from 'class-validator';

// "Esqueci a senha" (T-101). Só o e-mail; a resposta não revela se ele existe.
export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
