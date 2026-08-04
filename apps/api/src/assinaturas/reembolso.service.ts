import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsaasBillingService } from './asaas-billing.service';
import { Assinatura } from './assinatura.entity';
import {
  Elegibilidade,
  elegibilidadeReembolso,
  REEMBOLSO_PRAZO_DIAS,
} from './reembolso';
import { RefundRequest, RefundStatus } from './refund-request.entity';

// Reembolso self-service (T-218).
//
// 🔴 **Metade já existia (T-157): o CORTE DE ACESSO.** `PAYMENT_REFUNDED` no
// webhook grava `reembolsadaEm` e o `calcularAcesso` bloqueia. O que faltava era
// o cliente ter como PEDIR — e é só isso que esta classe adiciona.
//
// ⚠️ **A aprovação não corta acesso.** Ela chama o provedor; quem corta é o
// webhook, quando o dinheiro de fato volta. Cortar na aprovação tiraria o acesso
// antes de devolver o dinheiro — o pior dos dois mundos para o cliente.
//
// ⚠️ **Dentro dos 7 dias do CDC o reembolso é DIREITO**, não liberalidade. O
// passo manual (decisão do dono, 04/08) é operacional: ele executa, não decide
// se cabe. Recusar dentro do prazo é assumir risco jurídico, e por isso a recusa
// exige justificativa escrita.

export interface SituacaoReembolso {
  elegibilidade: Elegibilidade;
  /** Solicitação em aberto, se houver — a tela mostra "em análise". */
  pendente: RefundRequest | null;
  prazoDias: number;
}

@Injectable()
export class ReembolsoService {
  private readonly logger = new Logger(ReembolsoService.name);

  constructor(
    @InjectRepository(RefundRequest)
    private readonly pedidos: Repository<RefundRequest>,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    private readonly asaas: AsaasBillingService,
  ) {}

  /** O que a tela do assinante precisa para decidir o que oferecer. */
  async situacao(
    userId: string,
    now: Date = new Date(),
  ): Promise<SituacaoReembolso> {
    const pendente = await this.pedidos.findOne({
      where: { userId, status: 'pendente' },
    });
    const cobrancas = await this.cobrancasCruas(userId);
    return {
      elegibilidade: elegibilidadeReembolso(cobrancas, now),
      pendente,
      prazoDias: REEMBOLSO_PRAZO_DIAS,
    };
  }

  async solicitar(
    userId: string,
    motivo: string | undefined,
    now: Date = new Date(),
  ): Promise<RefundRequest> {
    const jaPendente = await this.pedidos.findOne({
      where: { userId, status: 'pendente' },
    });
    // Idempotente na prática: clicar duas vezes não gera duas solicitações, e o
    // dono não trabalha a mesma fila duas vezes.
    if (jaPendente) return jaPendente;

    const cobrancas = await this.cobrancasCruas(userId);
    const elegibilidade = elegibilidadeReembolso(cobrancas, now);
    if (!elegibilidade.pagamentoId) {
      throw new BadRequestException(
        'Não encontramos um pagamento para reembolsar.',
      );
    }

    const cobranca = cobrancas.find((c) => c.id === elegibilidade.pagamentoId);
    const pedido = await this.pedidos.save(
      this.pedidos.create({
        userId,
        paymentId: elegibilidade.pagamentoId,
        // Reais → centavos: a fronteira de unidade do Asaas (§ `centavosParaReais`).
        valorCentavos: Math.round((cobranca?.value ?? 0) * 100),
        // ⚠️ CONGELADO. Se o dono levar dois dias para decidir, recalcular
        // transformaria um pedido legítimo em fora do prazo.
        dentroDoPrazo: elegibilidade.dentroDoPrazo,
        motivo: motivo?.trim() || null,
        status: 'pendente',
      }),
    );
    this.logger.log(
      `Reembolso solicitado por ${userId} (${pedido.paymentId}, ${elegibilidade.dentroDoPrazo ? 'no prazo' : 'fora do prazo'}).`,
    );
    return pedido;
  }

  /** Fila do `/admin`. Pendentes primeiro — são as que exigem ação. */
  async listar(status?: RefundStatus): Promise<RefundRequest[]> {
    return this.pedidos.find({
      where: status ? { status } : {},
      order: { solicitadoEm: 'DESC' },
      take: 100,
    });
  }

  /**
   * Aprova e ESTORNA no provedor.
   *
   * ⚠️ Provedor primeiro, banco depois — a mesma ordem do cancelamento (T-217),
   * e pelo mesmo motivo: marcar aprovado sem o dinheiro ter voltado deixaria o
   * cliente achando que foi reembolsado quando não foi. Errar para o lado em que
   * o pedido continua na fila é barato; o inverso não.
   */
  async aprovar(
    id: string,
    adminId: string,
    now: Date = new Date(),
  ): Promise<RefundRequest> {
    const pedido = await this.carregarPendente(id);
    await this.asaas.estornar(pedido.paymentId);
    await this.pedidos.update(
      { id },
      {
        status: 'aprovada',
        decididoEm: now,
        decididoPor: adminId,
      },
    );
    // ⚠️ Nada de mexer em `reembolsadaEm` ou status da assinatura aqui: quem faz
    // isso é o webhook `PAYMENT_REFUNDED` (T-157), quando o dinheiro volta.
    this.logger.log(`Reembolso ${id} aprovado por ${adminId}.`);
    return {
      ...pedido,
      status: 'aprovada',
      decididoEm: now,
      decididoPor: adminId,
    };
  }

  /**
   * Recusa — exige justificativa.
   *
   * 🔴 A justificativa não é burocracia: **dentro dos 7 dias do CDC o reembolso
   * é direito do cliente**, e uma recusa ali precisa ficar registrada por
   * escrito, com autor e data. Fora do prazo é decisão comercial legítima, e o
   * texto volta para o cliente explicando.
   */
  async recusar(
    id: string,
    adminId: string,
    nota: string,
    now: Date = new Date(),
  ): Promise<RefundRequest> {
    const pedido = await this.carregarPendente(id);
    if (!nota?.trim()) {
      throw new BadRequestException('A recusa precisa de uma justificativa.');
    }
    if (pedido.dentroDoPrazo) {
      // Não bloqueia — a decisão é do dono —, mas deixa rastro de que foi
      // tomada contra o prazo legal.
      this.logger.warn(
        `Reembolso ${id} RECUSADO por ${adminId} DENTRO do prazo do CDC.`,
      );
    }
    await this.pedidos.update(
      { id },
      {
        status: 'recusada',
        decididoEm: now,
        decididoPor: adminId,
        notaDecisao: nota.trim(),
      },
    );
    return {
      ...pedido,
      status: 'recusada',
      decididoEm: now,
      decididoPor: adminId,
      notaDecisao: nota.trim(),
    };
  }

  private async carregarPendente(id: string): Promise<RefundRequest> {
    const pedido = await this.pedidos.findOne({ where: { id } });
    if (!pedido) throw new NotFoundException('Solicitação não encontrada.');
    if (pedido.status !== 'pendente') {
      // Idempotência do botão: duas abas abertas não estornam duas vezes.
      throw new BadRequestException('Esta solicitação já foi decidida.');
    }
    return pedido;
  }

  /**
   * Cobranças CRUAS do provedor — a política precisa de `paymentDate` e
   * `billingType`, que o `CobrancaAsaas` do portal não carrega (ele é o recorte
   * da TELA, e ampliá-lo por causa daqui misturaria dois consumidores).
   */
  private async cobrancasCruas(userId: string) {
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (assinatura?.provider !== 'asaas' || !assinatura.asaasSubscriptionId) {
      return [];
    }
    return this.asaas.cobrancasCruas(assinatura.asaasSubscriptionId);
  }
}
