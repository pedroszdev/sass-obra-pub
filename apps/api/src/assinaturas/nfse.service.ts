import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AsaasClient } from './asaas-client';
import { AsaasBillingService, AsaasPayment } from './asaas-billing.service';
import { ASAAS_CLIENT } from './asaas.provider';
import { Assinatura } from './assinatura.entity';
import { NfseEmitida } from './nfse-emitida.entity';

// NFS-e (T-219) — **aviso, não emissão** (decisão do dono, 04/08).
//
// 🔴 Por que não emitimos automaticamente: sondei o
// `POST /subscriptions/{id}/invoiceSettings` e ele exige **código de serviço
// municipal**, **código de serviço** e **descrição do serviço** — os três
// dependem da prefeitura e do contador. Some-se que a conta Asaas ainda é PF e
// o `municipalSettings` responde 404, então nada disso poderia ser exercitado.
// Num caminho fiscal, código errado é ISS errado; escrever às cegas ali é o pior
// lugar possível para adivinhar.
//
// O que o sistema faz então é o que dá para fazer com certeza: **dizer quais
// cobranças foram pagas e ficaram sem nota**, para o dono emitir à mão.

/** Uma cobrança paga que ainda não tem nota. */
export interface PagamentoSemNota {
  paymentId: string;
  email: string;
  valorCentavos: number;
  /** Quando o cliente pagou — é o fato gerador. */
  pagoEm: Date | null;
  meio: string | null;
}

/**
 * Janela da varredura. Cobrança antiga demais não vira trabalho novo — e sem
 * teto a lista cresceria para sempre, transformando o alerta em ruído.
 */
const DIAS_JANELA = 90;

/** Pago: o dinheiro entrou, então há fato gerador de nota. */
const PAGAS = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

interface ListaAsaas<T> {
  data?: T[];
}

interface InvoiceAsaas {
  id?: string;
  status?: string;
  payment?: string;
}

@Injectable()
export class NfseService {
  private readonly logger = new Logger(NfseService.name);

  constructor(
    @Inject(ASAAS_CLIENT)
    private readonly asaas: AsaasClient | null,
    @InjectRepository(NfseEmitida)
    private readonly emitidas: Repository<NfseEmitida>,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly billing: AsaasBillingService,
  ) {}

  /**
   * Cobranças pagas que ainda não têm nota fiscal.
   *
   * Três fontes se cruzam, e cada exclusão tem um motivo:
   *   1. **pagas** no provedor — sem pagamento não há fato gerador;
   *   2. **sem nota no Asaas** — se um dia a emissão automática ligar, elas
   *      somem daqui sozinhas, sem ninguém mexer neste código;
   *   3. **sem marca local** — o dono já emitiu pela prefeitura e disse isso.
   */
  async pagamentosSemNota(now: Date = new Date()): Promise<PagamentoSemNota[]> {
    if (!this.asaas) return [];
    const desde = new Date(now.getTime() - DIAS_JANELA * 86_400_000);

    const pagamentos = (await this.billing.pagamentosRecentes()).filter(
      (p) => p.status && PAGAS.has(p.status),
    );
    if (pagamentos.length === 0) return [];

    const [comNota, jaMarcadas] = await Promise.all([
      this.pagamentosComNota(),
      this.emitidas.find({
        where: {
          paymentId: In(
            pagamentos.map((p) => p.id).filter(Boolean) as string[],
          ),
        },
        select: { paymentId: true },
      }),
    ]);
    const marcadas = new Set(jaMarcadas.map((m) => m.paymentId));

    const pendentes = pagamentos.filter((p) => {
      if (!p.id || comNota.has(p.id) || marcadas.has(p.id)) return false;
      const pago = this.dataDoPagamento(p);
      // Sem data não dá para dizer se está na janela — e cobrar nota de algo
      // que talvez seja antigo geraria trabalho inventado.
      return pago !== null && pago.getTime() >= desde.getTime();
    });
    if (pendentes.length === 0) return [];

    const emails = await this.emailsPorAssinatura(pendentes);
    return pendentes.map((p) => ({
      paymentId: p.id as string,
      email: emails.get(p.subscription ?? '') ?? '(desconhecido)',
      // O Asaas fala reais; o resto do projeto fala centavos.
      valorCentavos: Math.round((p.value ?? 0) * 100),
      pagoEm: this.dataDoPagamento(p),
      meio: p.billingType ?? null,
    }));
  }

  /** Registra que a nota saiu à mão — é isto que cala o alerta. */
  async marcarEmitida(
    paymentId: string,
    adminId: string,
    numero: string | undefined,
    now: Date = new Date(),
  ): Promise<void> {
    // `save` com PK existente é atualização: marcar duas vezes é no-op, e o
    // botão pode ser clicado de duas abas.
    await this.emitidas.save({
      paymentId,
      emitidaEm: now,
      emitidaPor: adminId,
      numero: numero?.trim() || null,
    });
    this.logger.log(
      `NFS-e de ${paymentId} marcada como emitida por ${adminId}.`,
    );
  }

  /**
   * Cobranças que JÁ têm nota no Asaas.
   *
   * ⚠️ Só conta nota que não foi cancelada. Uma `CANCELED` significa que a
   * obrigação voltou a existir — tratá-la como resolvida esconderia justamente
   * o caso que precisa de ação.
   */
  private async pagamentosComNota(): Promise<Set<string>> {
    try {
      const lista = await this.cliente().get<ListaAsaas<InvoiceAsaas>>(
        '/invoices?limit=100',
      );
      return new Set(
        (lista.data ?? [])
          .filter((i) => i.payment && i.status !== 'CANCELED')
          .map((i) => i.payment as string),
      );
    } catch (erro) {
      // Falha aqui NÃO pode virar "ninguém tem nota" — isso alertaria sobre a
      // base inteira. Devolver "todos têm" cala o alerta desta rodada, que é o
      // erro barato: o próximo ciclo tenta de novo.
      this.logger.error(
        `Falha ao listar notas fiscais: ${this.msg(erro)} — varredura pulada.`,
      );
      throw erro;
    }
  }

  private async emailsPorAssinatura(
    pagamentos: AsaasPayment[],
  ): Promise<Map<string, string>> {
    const subs = [
      ...new Set(pagamentos.map((p) => p.subscription).filter(Boolean)),
    ] as string[];
    if (subs.length === 0) return new Map();
    const assinaturas = await this.assinaturas.find({
      where: { asaasSubscriptionId: In(subs) },
    });
    if (assinaturas.length === 0) return new Map();
    const users = await this.users.find({
      where: { id: In(assinaturas.map((a) => a.userId)) },
      select: { id: true, email: true },
    });
    const porUser = new Map(users.map((u) => [u.id, u.email]));
    return new Map(
      assinaturas
        .filter((a) => a.asaasSubscriptionId)
        .map((a) => [
          a.asaasSubscriptionId as string,
          porUser.get(a.userId) ?? '(desconhecido)',
        ]),
    );
  }

  /**
   * Quando o cliente pagou.
   *
   * ⚠️ `paymentDate` é NULO no cartão enquanto o status é `CONFIRMED` — só é
   * preenchido no crédito, ~30 dias depois (medido em 04/08). Contar por ele
   * deixaria toda cobrança de cartão fora da janela. `clientPaymentDate` é
   * literalmente "quando o cliente pagou", e é o fato gerador da nota.
   */
  private dataDoPagamento(p: AsaasPayment): Date | null {
    const bruto =
      (
        p as AsaasPayment & {
          clientPaymentDate?: string;
          confirmedDate?: string;
        }
      ).clientPaymentDate ??
      (p as AsaasPayment & { confirmedDate?: string }).confirmedDate ??
      p.paymentDate;
    if (!bruto) return null;
    const texto = bruto.trim();
    const soData = /^\d{4}-\d{2}-\d{2}$/.test(texto);
    // -03:00 fixo: o Brasil aboliu o horário de verão em 2019 (§8).
    const iso = soData
      ? `${texto}T00:00:00-03:00`
      : `${texto.replace(' ', 'T').slice(0, 19)}-03:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private cliente(): AsaasClient {
    if (!this.asaas) throw new Error('Asaas não configurado');
    return this.asaas;
  }

  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
