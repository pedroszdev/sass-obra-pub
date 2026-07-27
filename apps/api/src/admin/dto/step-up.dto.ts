import { IsString, MaxLength, MinLength } from 'class-validator';

// Reconfirmação de senha do admin (T-183). MaxLength 72 = teto do bcrypt (as
// senhas de leitura seguem o mesmo limite das de login).
export class StepUpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  senha!: string;
}

// Reconfirmação por Google (T-183): id_token fresco do popup do SDK, para a conta
// admin criada pelo Google (sem senha). 4096 = folga confortável para um JWT.
export class StepUpGoogleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  idToken!: string;
}
