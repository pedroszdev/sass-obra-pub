import { IsBoolean } from 'class-validator';

// Preferências de notificação (T-89). Push fica fora por ora (não implementado).
export class NotificationPrefsDto {
  @IsBoolean()
  whatsapp!: boolean;

  @IsBoolean()
  email!: boolean;
}
