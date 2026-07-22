import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuditService, AuditoriaPagina } from './admin-audit.service';
import { AdminDashboardService, ResumoAdmin } from './admin-dashboard.service';
import { AdminIaCustoService, PainelIaCusto } from './admin-ia-custo.service';
import {
  AdminIaOutputsService,
  IaOutputsPagina,
} from './admin-ia-outputs.service';
import { AdminMailLogService, MailLogPagina } from './admin-mail-log.service';
import { AdminSaudeService, SaudeIntegracoes } from './admin-saude.service';
import {
  AdminSearchLogService,
  ResumoBuscas,
} from './admin-search-log.service';
import { AdminStepUpService, StepUpStatus } from './admin-stepup.service';
import { AdminGuard } from './admin.guard';
import { Audit } from './audit.decorator';
import { ListAuditDto } from './dto/list-audit.dto';
import { ListBuscasDto } from './dto/list-buscas.dto';
import { ListIaOutputsDto, ReviewIaOutputDto } from './dto/ia-outputs.dto';
import { ListMailLogDto } from './dto/list-mail-log.dto';
import { StepUpDto } from './dto/step-up.dto';
import { FeedbackPagina, FeedbackService } from '../feedback/feedback.service';
import {
  ListFeedbackDto,
  UpdateFeedbackStatusDto,
} from '../feedback/dto/list-feedback.dto';

// Backoffice do dono (BACKLOG Épico 15). Todo o módulo é ADMIN-only e auditado.
//
// Os três metadados valem para o controller inteiro (convenção do módulo — todo
// controller de admin repete este trio):
//   - JwtAuthGuard autentica e popula `req.user`;
//   - AdminGuard exige ADMIN e devolve 404 a qualquer outro (§T-180);
//   - AdminAuditInterceptor grava toda mutação (e GET anotado com @Audit) em
//     admin_audit_log (§T-182).
// FICA FORA do SubscriptionGuard — admin não é rota de produto.
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly auditoria: AdminAuditService,
    private readonly dashboard: AdminDashboardService,
    private readonly buscas: AdminSearchLogService,
    private readonly iaOutputs: AdminIaOutputsService,
    private readonly saude: AdminSaudeService,
    private readonly feedback: FeedbackService,
    private readonly iaCusto: AdminIaCustoService,
    private readonly mailLog: AdminMailLogService,
    private readonly stepUp: AdminStepUpService,
  ) {}

  // Step-up (T-183): status atual do "modo sudo" (o front mostra travado/aberto).
  @Get('step-up')
  stepUpStatus(@CurrentUser() user: AuthenticatedUser): Promise<StepUpStatus> {
    return this.stepUp.status(user.id);
  }

  // Reconfirma a senha e abre a janela de step-up. @Audit — é um evento de
  // segurança que vale rastrear.
  @Audit('admin.step-up')
  @Post('step-up')
  stepUpConfirmar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StepUpDto,
  ): Promise<StepUpStatus> {
    return this.stepUp.confirmar(user.id, dto.senha);
  }

  // Sanidade: confirma que a sessão atual é admin e que o guard deixou passar.
  // É o que o front (T-181) sonda para decidir se mostra a área. Um não-admin
  // recebe 404 aqui — idêntico a uma rota inexistente.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): { id: string; role: string } {
    return { id: user.id, role: user.role };
  }

  // Home do admin (T-194): números do negócio. Sem @Audit — são agregados, não
  // acesso a dado pessoal de uma conta específica.
  @Get('dashboard')
  resumo(): Promise<ResumoAdmin> {
    return this.dashboard.resumo();
  }

  // Consulta da trilha de auditoria (T-182): filtro por período e ação, paginado.
  // Não é anotado com @Audit — ler a auditoria não gera auditoria (evita ruído
  // recursivo); o que importa rastrear são as mutações e o acesso a dado pessoal.
  @Get('audit')
  audit(@Query() q: ListAuditDto): Promise<AuditoriaPagina> {
    return this.auditoria.listar({
      desde: q.desde ? new Date(q.desde) : undefined,
      ate: q.ate ? new Date(q.ate) : undefined,
      acao: q.acao,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    });
  }

  // O que estão buscando + o que dá zero (T-199). Anotado com @Audit: a lista de
  // buscas vazias traz o userId (quem quer a região) — é acesso a dado pessoal.
  @Audit('buscas.view')
  @Get('buscas')
  buscasResumo(@Query() q: ListBuscasDto): Promise<ResumoBuscas> {
    return this.buscas.resumo({
      desde: q.desde ? new Date(q.desde) : undefined,
      ate: q.ate ? new Date(q.ate) : undefined,
    });
  }

  // Medidor de custo de IA (T-190b). Sem @Audit — agregado de infra/custo.
  @Get('ia-custo')
  iaCustoPainel(): Promise<PainelIaCusto> {
    return this.iaCusto.painel();
  }

  // Amostra de saídas de IA para conferência (T-200). Sem @Audit — é saída de IA
  // ligada ao edital, não dado pessoal de uma conta.
  @Get('ia-outputs')
  iaOutputs_(@Query() q: ListIaOutputsDto): Promise<IaOutputsPagina> {
    return this.iaOutputs.listar({
      tipo: q.tipo,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    });
  }

  // Marca uma saída como certa/errada (T-200). Vira dataset; mutação → auditada.
  @Audit('ia.review')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('ia-outputs/review')
  marcarIaOutput(@Body() dto: ReviewIaOutputDto): Promise<void> {
    return this.iaOutputs.marcar(dto);
  }

  // Saúde das integrações + sanidade de env (T-201). Só nomes + presença — nunca
  // valor de segredo. Sem @Audit (leitura de infra, sem dado pessoal).
  @Get('saude')
  saudeEstado(): SaudeIntegracoes {
    return this.saude.estado();
  }

  // Log de e-mails transacionais (T-193). @Audit — a lista traz o e-mail do
  // destinatário (dado pessoal).
  @Audit('mail-log.view')
  @Get('mail-log')
  mailLogLista(@Query() q: ListMailLogDto): Promise<MailLogPagina> {
    return this.mailLog.listar({
      email: q.email,
      status: q.status,
      page: q.page ?? 1,
    });
  }

  // Fila de feedback/bug in-app (T-202). @Audit — a lista traz o userId de quem
  // reportou (dado pessoal).
  @Audit('feedback.view')
  @Get('feedback')
  feedbackLista(@Query() q: ListFeedbackDto): Promise<FeedbackPagina> {
    return this.feedback.listar({ status: q.status, page: q.page ?? 1 });
  }

  @Audit('feedback.status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('feedback/:id/status')
  feedbackStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ): Promise<void> {
    return this.feedback.atualizarStatus(id, dto.status);
  }
}
