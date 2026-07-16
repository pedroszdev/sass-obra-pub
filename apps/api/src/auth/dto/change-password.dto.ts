import { IsString, MaxLength } from 'class-validator';
import { IsSenhaForte, SENHA_MAX } from '../../common/senha';

// Troca de senha do usuário logado (T-89). Mesmas regras do cadastro e do reset.
export class ChangePasswordDto {
  // Sem @IsSenhaForte: é a senha ATUAL, que pode ser anterior à política (T-153).
  // Só o teto do bcrypt, como no login.
  @IsString()
  @MaxLength(SENHA_MAX)
  currentPassword!: string;

  // Política de senha forte (T-153): 8–72, maiúscula, minúscula, número e
  // especial. O teto de 72 (bcrypt trunca acima) já vive dentro de @IsSenhaForte.
  @IsString()
  @IsSenhaForte()
  newPassword!: string;
}
