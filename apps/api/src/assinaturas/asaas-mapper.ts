import { AssinaturaStatus } from './assinatura-status.enum';
import { dataAsaas } from './asaas-webhook.service';
import { Plano } from './precos';

// Deriva o estado de uma assinatura a partir do que o ASAAS diz (T-223).
//
// 🔴 **A diferença de fundo em relação à Stripe, e é ela que justifica este
// arquivo:** lá, `subscription.status` já carrega `past_due` — um retrieve
// responde tudo. **No Asaas a assinatura fica `ACTIVE` mesmo com cobrança
// vencida**; o objeto da assinatura não sabe se alguém pagou. O estado real só
// existe cruzando a assinatura COM as cobranças dela.
//
// Por isso a regra mora aqui, pura e testada (§3.3): é ela que decide quem tem
// acesso na reconciliação, e errar significa barrar quem pagou ou liberar quem
// não pagou.

/** A assinatura no Asaas, nos campos que a reconciliação lê. */
export interface AsaasSubscriptionEstado {
  id?: string;
  status?: string;
  nextDueDate?: string;
  cycle?: string;
  deleted?: boolean;
}

/** Uma cobrança da assinatura, nos campos que decidem o estado. */
export interface AsaasPagamentoEstado {
  status?: string;
  dueDate?: string;
}

export interface EstadoVindoDoAsaas {
  status: AssinaturaStatus;
  currentPeriodEnd: Date | null;
  /** `null` = ciclo não reconhecido; quem chama preserva o plano local. */
  plano: Plano | null;
}

/** Pagou: os DOIS liberam. `CONFIRMED` é "o pagamento aconteceu"; `RECEIVED` é
 *  "o dinheiro caiu". Esperar o repasse puniria o cliente por tesouraria — é a
 *  mesma decisão que o webhook (T-214) já tomou. */
const PAGAS = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);

/** Estornada: o dinheiro voltou. Não conta como paga. */
const DEVOLVIDAS = new Set(['REFUNDED', 'CHARGEBACK_REQUESTED']);

/**
 * Ciclo do Asaas → nosso plano. Desconhecido vira `null` (e não um chute), pelo
 * mesmo motivo do `stripe-mapper`: recorrência que não reconhecemos preserva o
 * plano local em vez de reescrevê-lo errado.
 */
export function planoDoCiclo(cycle?: string): Plano | null {
  if (cycle === 'MONTHLY') return 'mensal';
  if (cycle === 'YEARLY') return 'anual';
  return null;
}

/**
 * O estado que o Asaas descreve. `null` = **não dá para saber** → quem chama
 * não mexe.
 *
 * A ordem das regras é a decisão, e cada degrau tem um porquê:
 *
 * 1. **Apagada** vence tudo. No Asaas cancelar é `DELETE`, e depois dele o GET
 *    ainda responde com `deleted: true` **e** `status: INACTIVE` — dois sinais
 *    para o mesmo fato (medido na T-217). Aceitamos qualquer um dos dois, como
 *    a `agendadaParaCancelar` da Stripe faz com os dela.
 *    ⚠️ `currentPeriodEnd` sai `null` aqui de propósito: **quem cancelou mantém
 *    o acesso até o fim do que pagou (T-144), e essa data é a que JÁ está no
 *    nosso banco.** Devolvê-la daqui a sobrescreveria com o `nextDueDate`, que
 *    para uma assinatura apagada não significa mais nada.
 * 2. **Cobrança vencida** → `past_due`. É o degrau que não existe no objeto da
 *    assinatura e só aparece nas cobranças.
 * 3. **Alguma paga** → `active`.
 * 4. **Só pendente com vencimento no futuro** → `active` também. É o caso que a
 *    conversão de trial e a reativação criam: a assinatura existe, o cartão foi
 *    validado, e a 1ª cobrança está adiada. Tratar isso como "não pagou" faria
 *    a reconciliação DESFAZER a marcação local — e foi exatamente esse buraco
 *    que deixou uma assinatura presa em `TRIALING` no dia 03/08.
 * 5. **Nenhuma cobrança** → `null`. Assinatura recém-criada cujo pagamento
 *    ainda não nasceu; não se conclui nada.
 */
export function estadoDoAsaas(
  sub: AsaasSubscriptionEstado | null,
  pagamentos: AsaasPagamentoEstado[],
  now: Date = new Date(),
): EstadoVindoDoAsaas | null {
  if (!sub) return null;
  const plano = planoDoCiclo(sub.cycle);

  if (sub.deleted === true || sub.status === 'INACTIVE') {
    return {
      status: AssinaturaStatus.CANCELED,
      currentPeriodEnd: null,
      plano,
    };
  }

  const vencimento = dataAsaas(sub.nextDueDate);
  const relevantes = pagamentos.filter(
    (p) => p.status && !DEVOLVIDAS.has(p.status),
  );

  if (relevantes.some((p) => p.status === 'OVERDUE')) {
    return {
      status: AssinaturaStatus.PAST_DUE,
      currentPeriodEnd: vencimento,
      plano,
    };
  }
  if (relevantes.some((p) => PAGAS.has(p.status!))) {
    return {
      status: AssinaturaStatus.ACTIVE,
      currentPeriodEnd: vencimento,
      plano,
    };
  }
  const pendenteFutura = relevantes.some(
    (p) =>
      p.status === 'PENDING' &&
      (dataAsaas(p.dueDate)?.getTime() ?? 0) > now.getTime(),
  );
  if (pendenteFutura) {
    return {
      status: AssinaturaStatus.ACTIVE,
      currentPeriodEnd: vencimento,
      plano,
    };
  }
  return null;
}
