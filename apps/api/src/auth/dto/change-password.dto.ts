import { IsString, MinLength } from 'class-validator';

// Troca de senha do usuário logado (T-89). Mesma regra mínima do cadastro.
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
