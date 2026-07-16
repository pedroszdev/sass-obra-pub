import { IsEmail, IsString, MaxLength } from 'class-validator';
import { SENHA_MAX } from '../../common/senha';

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Sem @IsSenhaForte: a política vale para senha NOVA (cadastro/reset/troca).
  // Exigi-la aqui trancaria para fora quem tem senha antiga, mais fraca que a
  // regra atual — o login confere o que existe, não o que deveria existir.
  // O teto de 72 é só o do bcrypt (que trunca acima disso), para não carregar
  // string sem uso até o hash.
  @IsString()
  @MaxLength(SENHA_MAX)
  password!: string;
}
