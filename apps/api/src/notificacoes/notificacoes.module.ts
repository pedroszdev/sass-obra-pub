import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertasModule } from '../alertas/alertas.module';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { CompanyProfileModule } from '../company-profile/company-profile.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { User } from '../users/user.entity';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';
import { NotificationLog } from './notification-log.entity';

// Envio real de notificações por e-mail (T-103) + "melhor obra do dia" (T-135)
// + aviso de renovação anual (T-158). Reusa a derivação de alertas
// (AlertasModule/T-90), o filtro de aptidão (CompanyProfileModule/T-53), o
// e-mail transacional (MailModule/T-101) e a assinatura + preço da Stripe
// (AssinaturasModule/T-131 — o valor do aviso NUNCA sai do nosso banco).
@Module({
  imports: [
    TypeOrmModule.forFeature([User, NotificationLog]),
    AlertasModule,
    AssinaturasModule,
    CompanyProfileModule,
    UsersModule,
    MailModule,
  ],
  controllers: [NotificacoesController],
  providers: [NotificacoesService],
  exports: [NotificacoesService], // disparo pelo admin (T-188)
})
export class NotificacoesModule {}
