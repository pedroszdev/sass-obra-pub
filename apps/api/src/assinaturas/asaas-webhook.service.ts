import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { AsaasClient } from './asaas-client';
import { ASAAS_CLIENT } from './asaas.provider';
import { AsaasEvent } from './asaas-event.entity';
import { Assinatura } from './assinatura.entity';
import { AssinaturaStatus } from './assinatura-status.enum';

// Webhook do Asaas (T-214) — é AQUI, e só aqui, que alguém vira `active`.
//
// Mesma regra que vale para a Stripe (§8): o retorno do navegador não prova
// pagamento; a `successUrl` pode ser digitada na barra de endereço. O que prova
// é o provedor nos contar por um canal autenticado.
//
// Três fatos do Asaas que moldam este arquivo (medidos na T-209):
//   1. Entrega **"at least once"** → o mesmo evento chega duas vezes. A PK de
//      `asaas_events` é a barreira.
//   2. **Sem garantia de ordem** → um evento velho pode chegar depois de um
//      novo. `asaasAtualizadoEm` é o carimbo que impede o retrocesso.
//   3. **A fila PARA** depois de falhas seguidas (`interrupted`,
//      `penalizedRequestsCount`). Por isso um erro aqui precisa ser barulhento:
//      falhar em silêncio custaria a interrupção da cobrança inteira.

/**
 * Data do Asaas → instante real (UTC).
 *
 * 🔴 O Asaas manda `"2026-07-30 10:00:00"` — **sem fuso**, em horário de
 * BRASÍLIA. `new Date('2026-07-30T10:00:00')` interpreta como hora LOCAL DO
 * SERVIDOR, e o nosso servidor roda em **UTC** (Render, Oregon). Isso são
 * **3 horas de erro** em cada carimbo.
 *
 * Por que importa, mesmo com todos os eventos igualmente deslocados: o campo
 * `asaasAtualizadoEm` também recebe `now` (relógio real, UTC) quando o evento
 * chega sem data. Aí um evento legítimo pode parecer 3h mais velho que o estado
 * e ser **descartado pela guarda de ordem** — quem pagou não é liberado.
 * Misturar dois relógios no mesmo campo é a receita do bug silencioso.
 *
 * `-03:00` fixo é seguro: o Brasil **aboliu o horário de verão em 2019**, então
 * não há data em que o offset mude. Se algum dia voltar, este é o ponto único a
 * corrigir. Datas puras (`YYYY-MM-DD`, como o `nextDueDate`) também passam por
 * aqui e viram meia-noite de Brasília, que é o que elas significam.
 */
export function dataAsaas(valor?: string): Date | null {
  if (!valor) return null;
  const texto = valor.trim();
  const comHora = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(texto);
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(texto);
  if (!comHora && !soData) return null;
  const iso = soData
    ? `${texto}T00:00:00-03:00`
    : `${texto.replace(' ', 'T').slice(0, 19)}-03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Envelope do evento, nos campos que usamos. */
export interface EventoAsaas {
  id?: string;
  event?: string;
  dateCreated?: string;
  payment?: {
    id?: string;
    customer?: string;
    subscription?: string;
    value?: number;
    status?: string;
    billingType?: string;
  };
}

interface AsaasSubscription {
  id: string;
  status?: string;
  nextDueDate?: string;
}

// Pagamento confirmado/recebido: os DOIS liberam acesso. `CONFIRMED` é "o
// pagamento aconteceu"; `RECEIVED` é "o dinheiro caiu na conta". Para o acesso
// do cliente, esperar o repasse seria puni-lo por uma questão de tesouraria.
const EVENTOS_PAGO = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);

// Vencido sem pagar. Não corta na hora — vira `past_due`, e a carência de 3 dias
// (T-130) decide o bloqueio.
const EVENTOS_VENCIDO = new Set(['PAYMENT_OVERDUE']);

// Estorno. ⚠️ `PAYMENT_PARTIALLY_REFUNDED` fica de FORA de propósito: a regra do
// projeto (T-157) é que só o reembolso INTEGRAL corta acesso — devolver parte do
// valor não desfaz a assinatura.
const EVENTOS_REEMBOLSO = new Set(['PAYMENT_REFUNDED']);

@Injectable()
export class AsaasWebhookService {
  private readonly logger = new Logger(AsaasWebhookService.name);

  constructor(
    @Inject(ASAAS_CLIENT)
    private readonly asaas: AsaasClient | null,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(AsaasEvent)
    private readonly eventos: Repository<AsaasEvent>,
  ) {}

  async processar(
    evento: EventoAsaas,
    now: Date = new Date(),
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    if (!evento?.id || !evento.event) {
      // Sem id não há como deduplicar; sem tipo não há o que aplicar. Registrar
      // e seguir (200) — devolver erro faria o Asaas reentregar um lixo para
      // sempre, e a fila dele PARA depois de falhas seguidas.
      this.logger.error('Evento do Asaas sem id ou sem tipo — descartado.');
      return { aplicado: false, motivo: 'evento malformado' };
    }

    const criadoEmAsaas = this.data(evento.dateCreated);

    // Idempotência: grava ANTES de aplicar, para que uma reentrega durante o
    // processamento não duplique efeito. Mesma estratégia do webhook da Stripe.
    const inserido = await this.eventos
      .createQueryBuilder()
      .insert()
      .values({ id: evento.id, tipo: evento.event, criadoEmAsaas })
      .orIgnore()
      .execute();
    if ((inserido.raw as unknown[]).length === 0) {
      return { aplicado: false, motivo: 'evento repetido' };
    }

    try {
      return await this.aplicar(evento, criadoEmAsaas, now);
    } catch (erro) {
      // Grave: um pagamento pode não ter sido registrado. Vai para o Sentry e o
      // registro do evento é REMOVIDO, para que a reentrega tente de novo.
      capturarErro(erro, 'asaas.webhook', { tipo: evento.event });
      this.logger.error(`Falha ao aplicar ${evento.event}: ${this.msg(erro)}`);
      await this.eventos.delete({ id: evento.id });
      throw erro;
    }
  }

  private async aplicar(
    evento: EventoAsaas,
    criadoEmAsaas: Date | null,
    now: Date,
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    const tipo = evento.event!;
    if (
      !EVENTOS_PAGO.has(tipo) &&
      !EVENTOS_VENCIDO.has(tipo) &&
      !EVENTOS_REEMBOLSO.has(tipo)
    ) {
      return { aplicado: false, motivo: 'tipo ignorado' };
    }

    const assinatura = await this.localizar(evento);
    if (!assinatura) {
      // Não é erro nosso: o Asaas manda eventos de TODA a conta, e nem toda
      // cobrança nasce daqui (o dono pode cobrar alguém pelo painel). Ignorar em
      // silêncio seria ruim, lançar seria pior — o Asaas reentregaria para
      // sempre e a fila acabaria interrompida.
      this.logger.warn(
        `Evento ${tipo} sem assinatura correspondente (sub=${evento.payment?.subscription ?? '-'}, cus=${evento.payment?.customer ?? '-'}).`,
      );
      return { aplicado: false, motivo: 'assinatura não encontrada' };
    }

    // Guarda de ORDEM. Sem ela, um `PAYMENT_OVERDUE` atrasado chegando depois de
    // um `PAYMENT_CONFIRMED` novo bloquearia quem acabou de pagar.
    if (
      criadoEmAsaas &&
      assinatura.asaasAtualizadoEm &&
      criadoEmAsaas < assinatura.asaasAtualizadoEm
    ) {
      return { aplicado: false, motivo: 'evento mais antigo que o estado' };
    }

    if (EVENTOS_REEMBOLSO.has(tipo)) {
      // Reembolso integral corta o acesso (T-157). Fica FORA da guarda de estado
      // do pagamento — é fato que sobrevive à reconciliação.
      await this.assinaturas.update(
        { id: assinatura.id },
        {
          status: AssinaturaStatus.CANCELED,
          reembolsadaEm: now,
          asaasAtualizadoEm: criadoEmAsaas ?? now,
        },
      );
      return { aplicado: true };
    }

    if (EVENTOS_VENCIDO.has(tipo)) {
      await this.assinaturas.update(
        { id: assinatura.id },
        {
          status: AssinaturaStatus.PAST_DUE,
          // Preserva o início da inadimplência: a carência (T-130) conta do
          // PRIMEIRO vencimento, e sobrescrever a cada evento a reiniciaria,
          // deixando o inadimplente com acesso para sempre.
          pastDueDesde: assinatura.pastDueDesde ?? now,
          asaasAtualizadoEm: criadoEmAsaas ?? now,
        },
      );
      return { aplicado: true };
    }

    // Pago: libera o acesso e estende o período.
    const fim = await this.fimDoPeriodo(evento.payment?.subscription);
    await this.assinaturas.update(
      { id: assinatura.id },
      {
        status: AssinaturaStatus.ACTIVE,
        provider: 'asaas',
        pastDueDesde: null, // pagou: a carência zera
        currentPeriodEnd: fim ?? assinatura.currentPeriodEnd,
        asaasAtualizadoEm: criadoEmAsaas ?? now,
      },
    );
    return { aplicado: true };
  }

  /**
   * Acha a assinatura pelo id no provedor; se não houver, pelo cliente.
   *
   * A ordem importa: `subscription` é específico, `customer` é o fallback para
   * cobrança avulsa. Buscar primeiro por cliente casaria a cobrança errada em
   * quem tiver mais de uma assinatura ao longo do tempo.
   */
  private async localizar(evento: EventoAsaas): Promise<Assinatura | null> {
    const sub = evento.payment?.subscription;
    if (sub) {
      const porSub = await this.assinaturas.findOne({
        where: { asaasSubscriptionId: sub },
      });
      if (porSub) return porSub;
    }
    const cus = evento.payment?.customer;
    if (cus) {
      return this.assinaturas.findOne({ where: { asaasCustomerId: cus } });
    }
    return null;
  }

  /**
   * Até quando o acesso vale, lido da ASSINATURA no Asaas (`nextDueDate`).
   *
   * ⚠️ É uma chamada de rede dentro do webhook, e é deliberada: o evento de
   * pagamento **não traz** o fim do período, e calcular "dueDate + 1 ciclo" aqui
   * duplicaria a regra de calendário do provedor — que é quem sabe lidar com mês
   * de 28/31 dias e com pagamento adiantado. Errar isso corta acesso de quem
   * pagou.
   *
   * Falha na leitura NÃO derruba o evento: preserva-se o período anterior e
   * registra-se. Melhor um fim de período desatualizado do que perder a
   * confirmação de pagamento.
   */
  private async fimDoPeriodo(subId?: string): Promise<Date | null> {
    if (!subId || !this.asaas) return null;
    try {
      const sub = await this.asaas.get<AsaasSubscription>(
        `/subscriptions/${subId}`,
      );
      return this.data(sub.nextDueDate);
    } catch (erro) {
      this.logger.error(
        `Não foi possível ler nextDueDate de ${subId}: ${this.msg(erro)}`,
      );
      return null;
    }
  }

  private data(valor?: string): Date | null {
    return dataAsaas(valor);
  }

  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
