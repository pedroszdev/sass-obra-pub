import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertasModule } from '../alertas/alertas.module';
import { CompanyProfileModule } from '../company-profile/company-profile.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { User } from '../users/user.entity';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';
import { NotificationLog } from './notification-log.entity';

// Envio real de notificações por e-mail (T-103) + "melhor obra do dia" (T-135).
// Reusa a derivação de alertas (AlertasModule/T-90), o filtro de aptidão
// (CompanyProfileModule/T-53) e o e-mail transacional (MailModule/T-101).
@Module({
  imports: [
    TypeOrmModule.forFeature([User, NotificationLog]),
    AlertasModule,
    CompanyProfileModule,
    UsersModule,
    MailModule,
  ],
  controllers: [NotificacoesController],
  providers: [NotificacoesService],
})
export class NotificacoesModule {}
