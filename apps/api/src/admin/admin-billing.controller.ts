import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CobrancaAsaas } from '../assinaturas/asaas-billing.service';
import { AsaasReconciliacaoService } from '../assinaturas/asaas-reconciliacao.service';
import { ReconciliacaoService } from '../assinaturas/reconciliacao.service';
import {
  CandidatoReembolso,
  ReembolsoService,
} from '../assinaturas/reembolso.service';
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

  /**
   * Quem PODE ser reembolsado (T-218).
   *
   * 🔴 Não é fila de pedidos: o cliente pede por e-mail (decisão do dono,
   * 04/08), e aqui o dono ESCOLHE. A lista sai do provedor a cada abertura —
   * por isso uma cobrança já estornada some sozinha, sem estado nosso.
   *
   * ⚠️ Só aparece quem o provedor consegue estornar (cartão e Pix). Boleto fica
   * de fora: a API do Asaas não o cobre, e listá-lo daria um botão que sempre
   * falha — a devolução ali é transferência, operação manual.
   */
  @Get('reembolsos/elegiveis')
  elegiveis(): Promise<CandidatoReembolso[]> {
    return this.reembolso.listarElegiveis();
  }

  /**
   * Estorna a cobrança mais recente da conta. Step-up + auditoria: mexe em
   * dinheiro, e a auditoria É o histórico (não há tabela de reembolsos).
   *
   * ⚠️ Não corta acesso. Quem corta é o webhook `PAYMENT_REFUNDED` (T-157),
   * quando o dinheiro volta — cortar no clique tiraria o acesso antes de
   * devolver.
   */
  @UseGuards(AdminStepUpGuard)
  @Audit('billing.reembolsar')
  @HttpCode(HttpStatus.OK)
  @Post('reembolsos/:userId')
  reembolsar(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<{ paymentId: string; valorCentavos: number }> {
    return this.reembolso.reembolsar(userId);
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
