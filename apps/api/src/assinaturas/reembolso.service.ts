import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AsaasBillingService, AsaasPayment } from './asaas-billing.service';
import { Assinatura } from './assinatura.entity';
import {
  CobrancaReembolsavel,
  elegibilidadeReembolso,
  REEMBOLSO_PRAZO_DIAS,
} from './reembolso';

// Reembolso — **operação do dono, não self-service** (decisão do dono, 04/08).
//
// 🔴 O cliente pede por E-MAIL; aqui o dono escolhe quem reembolsar. Existiu uma
// versão com fila de solicitações e ela foi removida: sem pedido registrado não
// há o que guardar, e o histórico já vive na auditoria do `/admin` (`@Audit`).
//
// ⚠️ Metade da T-218 continua sendo da T-157: o CORTE DE ACESSO. Este serviço
// **não** mexe em acesso — quem corta é o webhook `PAYMENT_REFUNDED`, quando o
// dinheiro de fato volta. Cortar no clique tiraria o acesso antes de devolver.
//
// ⚠️ A lista NÃO é espelhada no nosso banco. Ela é calculada do provedor a cada
// abertura, e é isso que faz uma cobrança já estornada sumir sozinha: ela vira
// `REFUNDED` lá, deixa de ser "paga", e some daqui sem nenhum estado nosso.

export interface CandidatoReembolso {
  userId: string;
  email: string;
  paymentId: string;
  valorCentavos: number;
  /** Dentro dos 7 dias do CDC — a tela destaca, o dono decide. */
  dentroDoPrazo: boolean;
  prazoAte: Date | null;
  meio: string | null;
}

@Injectable()
export class ReembolsoService {
  private readonly logger = new Logger(ReembolsoService.name);

  constructor(
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly asaas: AsaasBillingService,
  ) {}

  /**
   * Quem PODE ser reembolsado agora.
   *
   * ⚠️ Uma leitura só do provedor para a conta inteira, não uma por assinante:
   * `GET /payments` traz `subscription` em cada cobrança, e o cruzamento com o
   * nosso banco é local. Consultar assinatura por assinatura seria N chamadas
   * de rede para responder uma pergunta que a listagem responde de uma vez.
   *
   * ⚠️ Aparecem os que **conseguem** ser estornados — cartão e Pix. Boleto fica
   * de fora porque a API do Asaas não o cobre (devolver ali é transferência,
   * operação manual); listá-lo daria um botão que sempre falha.
   */
  async listarElegiveis(now: Date = new Date()): Promise<CandidatoReembolso[]> {
    const pagamentos = await this.asaas.pagamentosRecentes();
    if (pagamentos.length === 0) return [];

    // Agrupa por assinatura: a política olha o histórico de CADA uma para achar
    // a paga mais recente.
    const porAssinatura = new Map<string, CobrancaReembolsavel[]>();
    for (const p of pagamentos) {
      const sub = (p as AsaasPayment & { subscription?: string }).subscription;
      if (!sub) continue;
      const lista = porAssinatura.get(sub) ?? [];
      lista.push(p);
      porAssinatura.set(sub, lista);
    }
    if (porAssinatura.size === 0) return [];

    const assinaturas = await this.assinaturas.find({
      where: { asaasSubscriptionId: Not(IsNull()) },
    });
    const emails = await this.emailsDe(assinaturas.map((a) => a.userId));

    const candidatos: CandidatoReembolso[] = [];
    for (const assinatura of assinaturas) {
      const cobrancas = porAssinatura.get(
        assinatura.asaasSubscriptionId as string,
      );
      if (!cobrancas) continue;
      const e = elegibilidadeReembolso(cobrancas, now);
      // Sem pagamento não há o que devolver; sem suporte de estorno, o botão
      // seria uma promessa que a API não cumpre.
      if (!e.pagamentoId || !e.estornavelPelaApi) continue;
      const cobranca = cobrancas.find((c) => c.id === e.pagamentoId);
      candidatos.push({
        userId: assinatura.userId,
        email: emails.get(assinatura.userId) ?? '(desconhecido)',
        paymentId: e.pagamentoId,
        // O Asaas fala reais; o resto do projeto fala centavos.
        valorCentavos: Math.round((cobranca?.value ?? 0) * 100),
        dentroDoPrazo: e.dentroDoPrazo,
        prazoAte: e.prazoAte,
        meio: cobranca?.billingType ?? null,
      });
    }
    // Quem está no prazo primeiro: ali o reembolso é DIREITO do cliente (art. 49
    // do CDC), não liberalidade — e o que é direito não pode ficar no rodapé.
    return candidatos.sort(
      (a, b) => Number(b.dentroDoPrazo) - Number(a.dentroDoPrazo),
    );
  }

  /**
   * Estorna a cobrança mais recente desta conta.
   *
   * ⚠️ Recalcula a elegibilidade em vez de confiar no id que a tela mandou: a
   * lista pode estar velha na aba aberta, e estornar por id vindo do cliente
   * deixaria o dono devolver uma cobrança que já não é a atual.
   *
   * ⚠️ **Integral, sempre.** A API do Asaas só estorna cartão por completo, e a
   * T-157 assume o mesmo: só o reembolso integral corta acesso.
   */
  async reembolsar(
    userId: string,
    now: Date = new Date(),
  ): Promise<{ paymentId: string; valorCentavos: number }> {
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura?.asaasSubscriptionId) {
      throw new BadRequestException(
        'Esta conta não tem assinatura no provedor para reembolsar.',
      );
    }
    const cobrancas = await this.asaas.cobrancasCruas(
      assinatura.asaasSubscriptionId,
    );
    const e = elegibilidadeReembolso(cobrancas, now);
    if (!e.pagamentoId) {
      throw new BadRequestException(
        'Não há pagamento a reembolsar nesta conta.',
      );
    }
    if (!e.estornavelPelaApi) {
      throw new BadRequestException(
        'O meio de pagamento desta cobrança não é estornável pela API — a devolução precisa ser por transferência.',
      );
    }

    await this.asaas.estornar(e.pagamentoId);
    const cobranca = cobrancas.find((c) => c.id === e.pagamentoId);
    // ⚠️ Nada de mexer em `reembolsadaEm` ou no status: quem faz isso é o
    // webhook `PAYMENT_REFUNDED` (T-157), quando o dinheiro volta.
    this.logger.log(
      `Reembolso solicitado ao provedor para ${userId} (${e.pagamentoId}, ${e.dentroDoPrazo ? 'no prazo' : 'fora do prazo'}).`,
    );
    return {
      paymentId: e.pagamentoId,
      valorCentavos: Math.round((cobranca?.value ?? 0) * 100),
    };
  }

  /** O prazo da política, para a tela não escrever o número por conta. */
  get prazoDias(): number {
    return REEMBOLSO_PRAZO_DIAS;
  }

  private async emailsDe(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.users.find({
      where: { id: In(ids) },
      select: { id: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u.email]));
  }
}
