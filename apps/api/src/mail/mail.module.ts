import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

// E-mail transacional (T-101). ConfigModule é global (app.module) → o
// MailService lê os envs SMTP direto. Exportado para o AuthModule usar.
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
