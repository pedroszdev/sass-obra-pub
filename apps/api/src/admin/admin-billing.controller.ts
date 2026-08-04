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
import {
  AsaasReconciliacaoService,
  ResultadoReconciliacaoAsaas,
} from '../assinaturas/asaas-reconciliacao.service';
import { NfseService, PagamentoSemNota } from '../assinaturas/nfse.service';
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
import { MarcarNfseDto } from './dto/marcar-nfse.dto';

// Espelho de assinaturas + webhooks (T-192). ADMIN-only e auditado. O "replay" de
// um webhook perdido é a RECONCILIAÇÃO: re-lê o estado atual do provedor e
// corrige — sem mexer no banco à mão. Portada para o Asaas na T-223.
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly billing: AdminBillingService,
    private readonly reconciliacaoAsaas: AsaasReconciliacaoService,
    private readonly reembolso: ReembolsoService,
    private readonly nfse: NfseService,
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

  /**
   * Cobranças pagas ainda sem NFS-e (T-219).
   *
   * 🔴 A emissão é MANUAL por decisão do dono (04/08), e a razão é medida: o
   * `invoiceSettings` do Asaas exige código de serviço municipal e descrição do
   * serviço — que dependem da prefeitura e do contador. Num caminho fiscal,
   * código errado é ISS errado, e a conta ainda é PF, então nada disso poderia
   * ser exercitado. O sistema faz o que dá com certeza: diz o que falta.
   */
  @Get('nfse/pendentes')
  nfsePendentes(): Promise<PagamentoSemNota[]> {
    return this.nfse.pagamentosSemNota();
  }

  /**
   * Marca que a nota saiu à mão — é isto que cala o alerta.
   *
   * ⚠️ Auditado: é uma DECLARAÇÃO do dono sobre obrigação fiscal, e quem
   * declarou precisa ficar registrado. Sem step-up: não move dinheiro nem
   * altera acesso, e exigir senha para uma marcação de rotina levaria a pessoa
   * a não marcar — o que quebra o alerta.
   */
  @Audit('billing.nfse-emitida')
  @HttpCode(HttpStatus.OK)
  @Post('nfse/:paymentId/emitida')
  marcarNfse(
    @Param('paymentId') paymentId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: MarcarNfseDto,
  ): Promise<void> {
    return this.nfse.marcarEmitida(paymentId, admin.id, dto.numero);
  }

  /**
   * Reconcilia TODAS (a rede de segurança inteira). Auditado.
   *
   * 📌 Era a da Stripe; passou a ser a do Asaas no corte (T-224).
   */
  @UseGuards(AdminStepUpGuard)
  @Audit('billing.reconciliar-tudo')
  @HttpCode(HttpStatus.OK)
  @Post('reconciliar')
  reconciliarTudo(): Promise<ResultadoReconciliacaoAsaas> {
    return this.reconciliacaoAsaas.reconciliar();
  }
}
