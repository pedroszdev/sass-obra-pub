import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailLog } from './mail-log.entity';
import { MailLogService } from './mail-log.service';
import { MailService } from './mail.service';
import { ResendWebhookController } from './resend-webhook.controller';
import { ResendWebhookService } from './resend-webhook.service';

// E-mail transacional (T-101) + log de envios e entrega/bounce (T-193).
// ConfigModule é global (app.module) → o MailService lê os envs SMTP direto.
// Exportado para o AuthModule usar. O webhook do Resend (público, assinado)
// carimba o status de entrega no mesmo mail_log.
@Module({
  imports: [TypeOrmModule.forFeature([MailLog])],
  controllers: [ResendWebhookController],
  providers: [MailService, MailLogService, ResendWebhookService],
  exports: [MailService],
})
export class MailModule {}
