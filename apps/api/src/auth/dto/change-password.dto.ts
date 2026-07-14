import { IsString, MaxLength, MinLength } from 'class-validator';

// Troca de senha do usuário logado (T-89). Mesmas regras do cadastro e do reset.
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  // bcrypt trunca acima de 72 bytes — o mesmo teto do cadastro e do reset (T-153).
  // Sem ele, quem trocasse por uma senha de 100 caracteres teria só os 72
  // primeiros valendo, sem saber: falsa sensação de força.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
