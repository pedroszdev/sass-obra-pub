import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AuthModule } from '../auth/auth.module';
import { RefreshToken } from '../auth/refresh-token.entity';
import { CaptacaoModule } from '../captacao/captacao.module';
import { Edital } from '../editais/edital.entity';
import { EditaisModule } from '../editais/editais.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { EditalExigencias } from '../editais/exigencias/edital-exigencias.entity';
import { EditalItensExtracao } from '../editais/itens/edital-itens-extracao.entity';
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
import { AdminAccountActionsService } from './admin-account-actions.service';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminCuradoriaService } from './admin-curadoria.service';
import { AdminEditaisController } from './admin-editais.controller';
import { AdminCaptacaoController } from './admin-captacao.controller';
import { AdminCaptacaoService } from './admin-captacao.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminIaOutputsService } from './admin-ia-outputs.service';
import { AdminSaudeService } from './admin-saude.service';
import { AdminSearchLogService } from './admin-search-log.service';
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
    ]),
  ],
  controllers: [
    AdminController,
    AdminAccountsController,
    AdminCaptacaoController,
    AdminEditaisController,
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
  ],
})
export class AdminModule {}
