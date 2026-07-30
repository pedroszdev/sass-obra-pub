import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

// "Esqueci a senha" (T-101). Só o e-mail; a resposta não revela se ele existe.
export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Token do Turnstile (T-203). Mesma razão do RegisterDto para estar declarado
  // aqui apesar de ser lido pelo guard: o ValidationPipe global roda com
  // `forbidNonWhitelisted` e rejeitaria a requisição inteira por campo extra.
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}
