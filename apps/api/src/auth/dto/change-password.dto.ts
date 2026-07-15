import { IsString } from 'class-validator';
import { IsSenhaForte } from '../../common/senha';

// Troca de senha do usuário logado (T-89). Mesmas regras do cadastro e do reset.
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  // Política de senha forte (T-153): 8–72, maiúscula, minúscula, número e
  // especial. O teto de 72 (bcrypt trunca acima) já vive dentro de @IsSenhaForte.
  @IsString()
  @IsSenhaForte()
  newPassword!: string;
}
