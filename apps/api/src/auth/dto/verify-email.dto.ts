import { IsString, MinLength } from 'class-validator';

// Verificação de e-mail via token do link (T-132).
export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
