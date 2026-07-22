import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailLog } from './mail-log.entity';
import { MailLogService } from './mail-log.service';
import { MailService } from './mail.service';

// E-mail transacional (T-101) + log de envios (T-193). ConfigModule é global
// (app.module) → o MailService lê os envs SMTP direto. Exportado para o
// AuthModule usar.
@Module({
  imports: [TypeOrmModule.forFeature([MailLog])],
  providers: [MailService, MailLogService],
  exports: [MailService],
})
export class MailModule {}
