import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Body,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { CobrancaAsaas } from '../assinaturas/asaas-billing.service';
import { AsaasReconciliacaoService } from '../assinaturas/asaas-reconciliacao.service';
import { ReconciliacaoService } from '../assinaturas/reconciliacao.service';
import { ReembolsoService } from '../assinaturas/reembolso.service';
import {
  RefundRequest,
  RefundStatus,
} from '../assinaturas/refund-request.entity';
import {
  AdminBillingService,
  AssinaturasPagina,
  Mrr,
  WebhooksPagina,
} from './admin-billing.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { AdminStepUpGuard } from './admin-stepup.guard';
import { Audit } from './audit.decorator';
import { ListBillingDto } from './dto/list-billing.dto';
import { RecusarReembolsoDto } from './dto/recusar-reembolso.dto';

// Espelho de assinaturas + webhooks (T-192). ADMIN-only e auditado. O "replay" de
// um webhook perdido é a RECONCILIAÇÃO (T-143): re-lê o estado atual da Stripe e
// corrige — sem mexer no banco à mão.
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly billing: AdminBillingService,
    private readonly reconciliacao: ReconciliacaoService,
    private readonly reconciliacaoAsaas: AsaasReconciliacaoService,
    private readonly reembolso: ReembolsoService,
  ) {}

  @Get('assinaturas')
  assinaturas(@Query() q: ListBillingDto): Promise<AssinaturasPagina> {
    return this.billing.listar({ status: q.status, page: q.page ?? 1 });
  }

  @Get('mrr')
  mrr(): Promise<Mrr | null> {
    return this.billing.mrr();
  }

  @Get('webhooks')
  webhooks(@Query() q: ListBillingDto): Promise<WebhooksPagina> {
    return this.billing.webhooks(q.page ?? 1);
  }

  /**
   * Cobranças de uma conta (T-221) — **leitura**.
   *
   * ⚠️ É o substituto do "reenviar cobrança" que o backlog pedia: **não existe
   * reenvio no Asaas**. O que resolve é o link de pagamento da cobrança em
   * aberto, que o dono copia e manda a quem perdeu o boleto de vista.
   *
   * Conta da Stripe devolve lista vazia — as faturas dela ficam no painel dela,
   * e duplicá-las aqui seria um segundo lugar para a mesma verdade.
   */
  @Get('cobrancas/:userId')
  cobrancas(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<CobrancaAsaas[]> {
    return this.billing.cobrancasDaConta(userId);
  }

  // Replay: reconcilia UMA assinatura (re-lê a Stripe e corrige). Auditado.
  @UseGuards(AdminStepUpGuard)
  @Audit('billing.reconciliar')
  @HttpCode(HttpStatus.OK)
  @Post('reconciliar/:userId')
  reconciliarUma(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<{ corrigida: boolean; semStripe: boolean }> {
    return this.reconciliacao.reconciliarUsuario(userId);
  }

  /**
   * Replay de UMA conta no ASAAS (T-223) — o botão que a T-221 adiou para cá.
   *
   * ⚠️ Rota separada da da Stripe porque a pergunta é outra: qual provedor cobra
   * ESTA conta. Um botão só que "tentasse os dois" esconderia qual respondeu, e
   * durante a coexistência é justamente isso que o dono precisa saber.
   */
  @UseGuards(AdminStepUpGuard)
  @Audit('billing.reconciliar-asaas')
  @HttpCode(HttpStatus.OK)
  @Post('reconciliar-asaas/:userId')
  reconciliarUmaAsaas(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<{ corrigida: boolean; semAsaas: boolean }> {
    return this.reconciliacaoAsaas.reconciliarUsuario(userId);
  }

  /** Fila de reembolso (T-218). Pendentes são as que exigem ação do dono. */
  @Get('reembolsos')
  reembolsos(@Query('status') status?: RefundStatus): Promise<RefundRequest[]> {
    return this.reembolso.listar(status);
  }

  /**
   * Aprova e ESTORNA no provedor (T-218). Step-up + auditoria: mexe em dinheiro.
   *
   * ⚠️ Não corta acesso aqui. Quem corta é o webhook `PAYMENT_REFUNDED` (T-157),
   * quando o dinheiro de fato volta — cortar na aprovação tiraria o acesso antes
   * de devolver.
   */
  @UseGuards(AdminStepUpGuard)
  @Audit('billing.reembolso-aprovar')
  @HttpCode(HttpStatus.OK)
  @Post('reembolsos/:id/aprovar')
  aprovarReembolso(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<RefundRequest> {
    return this.reembolso.aprovar(id, admin.id);
  }

  /**
   * Recusa — exige justificativa.
   *
   * 🔴 A justificativa não é burocracia: **dentro dos 7 dias do CDC o reembolso
   * é direito do cliente**, e recusar ali é assumir risco jurídico. O registro
   * escrito, com autor e data, é o mínimo.
   */
  @UseGuards(AdminStepUpGuard)
  @Audit('billing.reembolso-recusar')
  @HttpCode(HttpStatus.OK)
  @Post('reembolsos/:id/recusar')
  recusarReembolso(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: RecusarReembolsoDto,
  ): Promise<RefundRequest> {
    return this.reembolso.recusar(id, admin.id, dto.nota);
  }

  // Reconcilia TODAS (a rede de segurança inteira). Auditado.
  @UseGuards(AdminStepUpGuard)
  @Audit('billing.reconciliar-tudo')
  @HttpCode(HttpStatus.OK)
  @Post('reconciliar')
  reconciliarTudo(): Promise<{ verificadas: number; corrigidas: number }> {
    return this.reconciliacao.reconciliar();
  }
}
