import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AuthModule } from '../auth/auth.module';
import { RefreshToken } from '../auth/refresh-token.entity';
import { CaptacaoModule } from '../captacao/captacao.module';
import { Edital } from '../editais/edital.entity';
import { SyncRun } from '../editais/sync/sync-run.entity';
import { Atestado } from '../company-profile/atestado.entity';
import { Certidao } from '../company-profile/certidao.entity';
import { CompanyProfile } from '../company-profile/company-profile.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { NotificationLog } from '../notificacoes/notification-log.entity';
import { Proposta } from '../propostas/proposta.entity';
import { User } from '../users/user.entity';
import { AdminAccountActionsService } from './admin-account-actions.service';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminCaptacaoController } from './admin-captacao.controller';
import { AdminCaptacaoService } from './admin-captacao.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuditLog } from './admin-audit-log.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

// Backoffice do dono (BACKLOG Épico 15): trava de acesso (T-180), auditoria por
// padrão (T-182) e contas do beta (T-184). Cada controller repete o trio
// guard+guard+interceptor do AdminController.
//
// AdminGuard e AdminAuditInterceptor não têm estado, mas ficam providos aqui para
// o padrão dos épicos de segurança (testáveis e injetáveis no módulo).
@Module({
  imports: [
    AuthModule, // AdminAccountActionsService reusa o resendVerification
    CaptacaoModule, // disparo da captação (T-188)
    NotificacoesModule, // disparo das notificações/alertas (T-188)
    TypeOrmModule.forFeature([
      AdminAuditLog,
      User,
      Assinatura,
      CompanyProfile,
      Favorito,
      Proposta,
      Certidao,
      Atestado,
      NotificationLog,
      RefreshToken,
      Edital,
      SyncRun,
    ]),
  ],
  controllers: [
    AdminController,
    AdminAccountsController,
    AdminCaptacaoController,
  ],
  providers: [
    AdminGuard,
    AdminAuditInterceptor,
    AdminAuditService,
    AdminAccountsService,
    AdminAccountActionsService,
    AdminDashboardService,
    AdminCaptacaoService,
  ],
})
export class AdminModule {}
