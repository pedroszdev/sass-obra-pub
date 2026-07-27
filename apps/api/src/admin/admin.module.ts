import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { StripeEvent } from '../assinaturas/stripe-event.entity';
import { AuthModule } from '../auth/auth.module';
import { GoogleAuthModule } from '../auth/google/google-auth.module';
import { RefreshToken } from '../auth/refresh-token.entity';
import { CaptacaoModule } from '../captacao/captacao.module';
import { AiUsage } from '../editais/ai-usage.entity';
import { ConfigStoreModule } from '../config/config-store.module';
import { Edital } from '../editais/edital.entity';
import { EditaisModule } from '../editais/editais.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { MailModule } from '../mail/mail.module';
import { EditalExigencias } from '../editais/exigencias/edital-exigencias.entity';
import { EditalItensExtracao } from '../editais/itens/edital-itens-extracao.entity';
import { MailLog } from '../mail/mail-log.entity';
import { SearchLog } from '../editais/search-log.entity';
import { SyncRun } from '../editais/sync/sync-run.entity';
import { Atestado } from '../company-profile/atestado.entity';
import { Certidao } from '../company-profile/certidao.entity';
import { CompanyProfile } from '../company-profile/company-profile.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { NotificationLog } from '../notificacoes/notification-log.entity';
import { Proposta } from '../propostas/proposta.entity';
import { User } from '../users/user.entity';
import { AccountNote } from './account-note.entity';
import { AdminAccountActionsService } from './admin-account-actions.service';
import { AdminAccountNotesService } from './admin-account-notes.service';
import { AdminAiUsageService } from './admin-ai-usage.service';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminBillingController } from './admin-billing.controller';
import { AdminBillingService } from './admin-billing.service';
import { AdminBroadcastController } from './admin-broadcast.controller';
import { AdminBroadcastService } from './admin-broadcast.service';
import { BetaBroadcast } from './beta-broadcast.entity';
import { AdminClassificadorController } from './admin-classificador.controller';
import { AdminClassificadorService } from './admin-classificador.service';
import { AdminCuradoriaService } from './admin-curadoria.service';
import { AdminEditaisController } from './admin-editais.controller';
import { AdminImpersonationService } from './admin-impersonation.service';
import { AdminLgpdController } from './admin-lgpd.controller';
import { AdminLgpdService } from './admin-lgpd.service';
import { LgpdRequest } from './lgpd-request.entity';
import { ClassifierReview } from './classifier-review.entity';
import { AdminCaptacaoController } from './admin-captacao.controller';
import { AdminCaptacaoService } from './admin-captacao.service';
import { AdminConfigController } from './admin-config.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminIaCustoService } from './admin-ia-custo.service';
import { AdminIaOutputsService } from './admin-ia-outputs.service';
import { AdminMailLogService } from './admin-mail-log.service';
import { AdminSaudeService } from './admin-saude.service';
import { AdminSearchLogService } from './admin-search-log.service';
import { AdminStepUpGuard } from './admin-stepup.guard';
import { AdminStepUpService } from './admin-stepup.service';
import { AiOutputReview } from './ai-output-review.entity';
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
    FeedbackModule, // fila de feedback/bug in-app (T-202)
    EditaisModule, // ExigenciasService para regenerar o resumo (T-197)
    AssinaturasModule, // StripeBilling + Reconciliação para o billing (T-192)
    ConfigStoreModule, // config operacional: banner + dias de trial (T-195)
    MailModule, // envio do comunicado ao beta (T-198)
    GoogleAuthModule, // step-up por Google de admin só-social (T-183)
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
      SearchLog,
      EditalExigencias,
      EditalItensExtracao,
      AiOutputReview,
      StripeEvent,
      MailLog,
      AccountNote,
      ClassifierReview,
      AiUsage,
      LgpdRequest,
      BetaBroadcast,
    ]),
  ],
  controllers: [
    AdminController,
    AdminAccountsController,
    AdminCaptacaoController,
    AdminEditaisController,
    AdminBillingController,
    AdminClassificadorController,
    AdminLgpdController,
    AdminConfigController,
    AdminBroadcastController,
  ],
  providers: [
    AdminGuard,
    AdminAuditInterceptor,
    AdminAuditService,
    AdminAccountsService,
    AdminAccountActionsService,
    AdminDashboardService,
    AdminCaptacaoService,
    AdminSearchLogService,
    AdminIaOutputsService,
    AdminSaudeService,
    AdminCuradoriaService,
    AdminIaCustoService,
    AdminBillingService,
    AdminMailLogService,
    AdminStepUpService,
    AdminStepUpGuard,
    AdminImpersonationService,
    AdminAccountNotesService,
    AdminAiUsageService,
    AdminClassificadorService,
    AdminLgpdService,
    AdminBroadcastService,
  ],
})
export class AdminModule {}
