import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { PipelineAlertState } from '../captacao/pipeline-alert-state.entity';
import { MailService } from '../mail/mail.service';
import { emailPipelineQuebrado } from '../mail/mail.templates';
import { AsaasClient } from './asaas-client';
import {
  AsaasPagamentoEstado,
  AsaasSubscriptionEstado,
  estadoDoAsaas,
} from './asaas-mapper';
import { ASAAS_CLIENT } from './asaas.provider';
import { Assinatura } from './assinatura.entity';
import { NfseService } from './nfse.service';

// Reconciliação e observabilidade do Asaas (T-223) — a REDE DE SEGURANÇA do
// webhook, portada da T-143.
//
// 🔴 **Ela não existia para o Asaas, e a falta doeu de verdade:** em 03/08 uma
// assinatura ficou presa em `TRIALING` com a cobrança viva do outro lado, e não
// havia como destravá-la — a rotina da T-143 filtra por `stripeSubscriptionId`.
//
// Duas diferenças em relação à da Stripe, e as duas são do provedor:
//
//   1. **O estado exige DUAS leituras.** Lá `subscription.status` já carrega
//      `past_due`; aqui a assinatura fica `ACTIVE` mesmo com cobrança vencida, e
//      o estado real só sai cruzando assinatura + cobranças. A regra é a função
//      pura `estadoDoAsaas`.
//   2. **A fila de webhook PARA SOZINHA.** `interrupted` e
//      `penalizedRequestsCount` são campos de primeira classe do Asaas (medido):
//      falhas seguidas interrompem a entrega, e a cobrança simplesmente deixa de
//      chegar. Sem alerta, ninguém fica sabendo — e o sintoma é cliente pagante
//      preso no paywall, em silêncio.

export interface ResultadoReconciliacaoAsaas {
  verificadas: number;
  corrigidas: number;
  /** Fila de webhook interrompida ou desligada no provedor. */
  filaMuda: boolean;
  /** Cobranças pagas ainda sem NFS-e — o dono emite à mão (T-219). */
  notasPendentes: number;
}

/** Tipos de alerta no `pipeline_alert_state` — a mesma tabela da T-189, que é
 *  chaveada por tipo justamente para caber mais de um assunto. */
const ALERTA_DIVERGENCIA = 'billing_divergencia';
const ALERTA_FILA_MUDA = 'billing_fila_muda';
const ALERTA_NFSE = 'billing_nfse_pendente';
/** Mesmo cooldown da T-189: uma rodada ruim não vira dez e-mails. */
const COOLDOWN_HORAS = 12;

interface ListaAsaas<T> {
  data?: T[];
}

interface WebhookAsaas {
  name?: string;
  enabled?: boolean;
  interrupted?: boolean;
  penalizedRequestsCount?: number;
}

@Injectable()
export class AsaasReconciliacaoService {
  private readonly logger = new Logger(AsaasReconciliacaoService.name);

  constructor(
    @Inject(ASAAS_CLIENT)
    private readonly asaas: AsaasClient | null,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(PipelineAlertState)
    private readonly estadoAlerta: Repository<PipelineAlertState>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    // T-219: a emissão de NFS-e é MANUAL, então o sistema precisa avisar o que
    // ficou sem nota. Mora no mesmo job porque é a mesma pergunta — "o billing
    // está saudável?" — e um @Cron a mais no free tier é um @Cron que hiberna.
    private readonly nfse: NfseService,
  ) {}

  // @Cron best-effort — hiberna no free tier (§8). O gatilho confiável é o
  // endpoint de ops, batido por um cron externo, igual à captação.
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cronDiario(): Promise<void> {
    if (!this.asaas) return;
    await this.reconciliar().catch((e) => {
      capturarErro(e, 'asaas-reconciliacao.cron');
      this.logger.error(`Reconciliação Asaas (cron) falhou: ${this.msg(e)}`);
    });
  }

  async reconciliar(
    now: Date = new Date(),
  ): Promise<ResultadoReconciliacaoAsaas> {
    if (!this.asaas) {
      return {
        verificadas: 0,
        corrigidas: 0,
        filaMuda: false,
        notasPendentes: 0,
      };
    }

    // A saúde da FILA é verificada mesmo que nenhuma assinatura divirja: fila
    // interrompida é um problema por si só, e o sintoma dela é justamente a
    // ausência de mudanças.
    const filaMuda = await this.verificarFila();
    const notasPendentes = await this.verificarNotasFiscais(now);

    const comAsaas = await this.assinaturas.find({
      where: { asaasSubscriptionId: Not(IsNull()) },
    });

    const corrigidos: string[] = [];
    for (const assinatura of comAsaas) {
      try {
        if (await this.reconciliarUma(assinatura, now)) {
          corrigidos.push(assinatura.userId);
        }
      } catch (erro) {
        // Uma assinatura que falha não derruba as demais — mesma decisão da
        // T-143. Vai ao Sentry porque é o único registro que sobrevive ao log.
        capturarErro(erro, 'asaas-reconciliacao.uma', {
          assinaturaId: assinatura.id,
        });
        this.logger.warn(
          `Reconciliação Asaas falhou para ${assinatura.userId}: ${this.msg(erro)}`,
        );
      }
    }

    if (corrigidos.length > 0) {
      this.logger.log(
        `Reconciliação Asaas: ${corrigidos.length}/${comAsaas.length} corrigida(s).`,
      );
      // 🔴 Corrigir em SILÊNCIO esconderia o problema de fundo: toda divergência
      // é um webhook que se perdeu, e webhook que se perde uma vez se perde de
      // novo. Decisão do dono (03/08): alertar em toda correção, com cooldown.
      await this.alertar(
        ALERTA_DIVERGENCIA,
        [
          `${corrigidos.length} assinatura(s) do Asaas estavam divergentes e foram corrigidas pela reconciliação.`,
          `Contas: ${corrigidos.slice(0, 10).join(', ')}${corrigidos.length > 10 ? '…' : ''}`,
          'Cada divergência significa um webhook que não chegou ou não foi aplicado.',
        ],
        now,
      );
    }

    return {
      verificadas: comAsaas.length,
      corrigidas: corrigidos.length,
      filaMuda,
      notasPendentes,
    };
  }

  /**
   * Cobranças pagas sem nota fiscal (T-219).
   *
   * 🔴 A emissão automática NÃO foi construída, e por um motivo medido: o
   * `invoiceSettings` do Asaas exige código de serviço municipal e descrição do
   * serviço, que dependem da prefeitura e do contador — e a conta ainda é PF.
   * Num caminho fiscal, código errado é ISS errado. Então o sistema faz o que
   * dá para fazer com certeza: **avisa o que ficou sem nota**.
   *
   * ⚠️ Falha ao consultar NÃO alerta. Sem a lista de notas do provedor, toda
   * cobrança pareceria pendente — e um alerta sobre a base inteira treina o
   * leitor a ignorá-lo.
   */
  private async verificarNotasFiscais(now: Date): Promise<number> {
    let pendentes: Awaited<ReturnType<NfseService['pagamentosSemNota']>>;
    try {
      pendentes = await this.nfse.pagamentosSemNota(now);
    } catch (erro) {
      this.logger.warn(`Varredura de NFS-e pulada: ${this.msg(erro)}`);
      return 0;
    }
    if (pendentes.length === 0) return 0;

    await this.alertar(
      ALERTA_NFSE,
      [
        `${pendentes.length} cobrança(s) paga(s) ainda sem nota fiscal emitida.`,
        ...pendentes
          .slice(0, 10)
          .map(
            (p) =>
              `• ${p.email} — R$ ${(p.valorCentavos / 100).toFixed(2)} (${p.paymentId})`,
          ),
        'Emita as notas e marque como emitidas em /admin → Billing, senão este aviso se repete.',
      ],
      now,
    );
    return pendentes.length;
  }

  /** Replay de UMA conta (T-192/T-221): o botão do `/admin` quando um webhook
   *  se perde. Re-lê o estado ATUAL, não reprocessa o evento antigo. */
  async reconciliarUsuario(
    userId: string,
    now: Date = new Date(),
  ): Promise<{ corrigida: boolean; semAsaas: boolean }> {
    if (!this.asaas) return { corrigida: false, semAsaas: true };
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura?.asaasSubscriptionId) {
      return { corrigida: false, semAsaas: true };
    }
    return {
      corrigida: await this.reconciliarUma(assinatura, now),
      semAsaas: false,
    };
  }

  private async reconciliarUma(
    assinatura: Assinatura,
    now: Date,
  ): Promise<boolean> {
    const subId = assinatura.asaasSubscriptionId as string;
    const cliente = this.cliente();
    // As duas leituras que o estado exige. A da assinatura sozinha não sabe se
    // alguém pagou — ver `estadoDoAsaas`.
    const sub = await cliente.get<AsaasSubscriptionEstado>(
      `/subscriptions/${subId}`,
    );
    const pagamentos = await cliente.get<ListaAsaas<AsaasPagamentoEstado>>(
      `/subscriptions/${subId}/payments?limit=20`,
    );
    const estado = estadoDoAsaas(sub, pagamentos.data ?? [], now);
    if (!estado) return false; // não dá para saber → não mexe

    const mesmoFim =
      estado.currentPeriodEnd === null ||
      this.mesmaData(assinatura.currentPeriodEnd, estado.currentPeriodEnd);
    if (
      assinatura.status === estado.status &&
      mesmoFim &&
      (estado.plano === null || assinatura.plano === estado.plano)
    ) {
      return false; // nada divergiu → não escreve à toa
    }

    await this.assinaturas.update(
      { id: assinatura.id },
      {
        status: estado.status,
        // ⚠️ `null` do mapper significa "não tenho data melhor que a sua" — é o
        // caso da cancelada, cujo acesso vale até o fim do que foi pago (T-144).
        // Escrever null ali cortaria o acesso de quem cancelou tendo pago.
        ...(estado.currentPeriodEnd
          ? { currentPeriodEnd: estado.currentPeriodEnd }
          : {}),
        ...(estado.plano ? { plano: estado.plano } : {}),
        // Preserva o início da inadimplência, como o webhook (T-214): a carência
        // conta do PRIMEIRO vencimento, e reiniciá-la daria acesso eterno.
        ...(estado.status === 'past_due'
          ? { pastDueDesde: assinatura.pastDueDesde ?? now }
          : { pastDueDesde: null }),
      },
    );
    this.logger.log(
      `Asaas reconciliou ${assinatura.userId}: ${assinatura.status} → ${estado.status}.`,
    );
    return true;
  }

  /**
   * A fila de webhook está viva? (T-223)
   *
   * 🔴 `interrupted` e `penalizedRequestsCount` são campos de primeira classe do
   * Asaas: falhas seguidas INTERROMPEM a entrega. O sintoma é a ausência de
   * eventos — ou seja, nada acontece, e ninguém percebe até um cliente reclamar
   * que pagou e não foi liberado. **Painel que exige olhar não protege de quebra
   * silenciosa** (§8); é o alerta ativo que protege.
   */
  private async verificarFila(now: Date = new Date()): Promise<boolean> {
    let webhooks: WebhookAsaas[];
    try {
      const lista =
        await this.cliente().get<ListaAsaas<WebhookAsaas>>('/webhooks');
      webhooks = lista.data ?? [];
    } catch (erro) {
      // Não conseguir LER a configuração não é o mesmo que a fila estar parada.
      // Alertar aqui geraria falso positivo a cada instabilidade do provedor.
      this.logger.warn(`Não foi possível ler os webhooks: ${this.msg(erro)}`);
      return false;
    }

    const mudos = webhooks.filter((w) => w.interrupted || w.enabled === false);
    if (mudos.length === 0) return false;

    await this.alertar(
      ALERTA_FILA_MUDA,
      mudos.map(
        (w) =>
          `Webhook "${w.name ?? 'sem nome'}" está ${w.interrupted ? 'INTERROMPIDO' : 'DESABILITADO'} no Asaas` +
          (w.penalizedRequestsCount
            ? ` (${w.penalizedRequestsCount} falhas penalizadas).`
            : '.') +
          ' Enquanto isso, nenhuma confirmação de pagamento chega — quem pagar fica preso no paywall.',
      ),
      now,
    );
    return true;
  }

  /**
   * Alerta por e-mail com cooldown persistido — o padrão da T-189.
   *
   * ⚠️ O cooldown vive no BANCO, não em memória: o Render free hiberna, e um
   * cooldown em memória zeraria a cada acordar, transformando o alerta em spam
   * (que é como um alerta deixa de ser lido).
   */
  private async alertar(
    tipo: string,
    problemas: string[],
    now: Date,
  ): Promise<void> {
    const destino = this.config.get<string>('ADMIN_ALERT_EMAIL')?.trim();
    if (!destino) {
      // Mesma degradação dos demais provedores (§8): sem destinatário, loga e
      // segue — não derruba a reconciliação, que é o que de fato conserta.
      this.logger.warn(`[${tipo}] ${problemas.join(' ')}`);
      return;
    }
    const estado = await this.estadoAlerta.findOne({ where: { tipo } });
    const limite = now.getTime() - COOLDOWN_HORAS * 3_600_000;
    if (estado && estado.lastSentAt.getTime() > limite) return;

    try {
      await this.mail.sendMail({
        to: destino,
        ...emailPipelineQuebrado(problemas),
      });
      await this.estadoAlerta.save({ tipo, lastSentAt: now });
    } catch (e) {
      capturarErro(e, 'asaas-reconciliacao.alerta');
      this.logger.error(`Falha ao alertar (${tipo}): ${this.msg(e)}`);
    }
  }

  private mesmaData(a: Date | null, b: Date | null): boolean {
    if (a === null || b === null) return a === b;
    return new Date(a).getTime() === new Date(b).getTime();
  }

  private cliente(): AsaasClient {
    if (!this.asaas) throw new Error('Asaas não configurado');
    return this.asaas;
  }

  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
