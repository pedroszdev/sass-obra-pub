import { IsString, MaxLength, MinLength } from 'class-validator';

// Reconfirmação de senha do admin (T-183). MaxLength 72 = teto do bcrypt (as
// senhas de leitura seguem o mesmo limite das de login).
export class StepUpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  senha!: string;
}
