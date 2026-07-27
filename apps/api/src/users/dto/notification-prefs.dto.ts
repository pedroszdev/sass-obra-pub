import { IsBoolean, IsOptional } from 'class-validator';

// Preferências de notificação (T-89). Push fica fora por ora (não implementado).
export class NotificationPrefsDto {
  @IsBoolean()
  whatsapp!: boolean;

  @IsBoolean()
  email!: boolean;

  // Só o e-mail diário de obra do dia (T-135). Opcional para não quebrar clientes
  // antigos que só mandam whatsapp+email → ausente preserva o valor atual.
  @IsOptional()
  @IsBoolean()
  obraDoDia?: boolean;
}
