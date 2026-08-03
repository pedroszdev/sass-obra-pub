import { dataAsaas } from './asaas-webhook.service';

/**
 * Decide se a troca de plano pode REESCREVER as cobranças já geradas.
 *
 * ── Por que isto existe ──
 *
 * A T-216 fixou `updatePendingPayments: false` na troca de plano, e o motivo era
 * bom: reescrever uma cobrança que o cliente já pagou — ou um boleto que ele já
 * imprimiu — é mexer em dinheiro que saiu da mão dele.
 *
 * 🔴 **Mas o motivo pressupõe uma cobrança que chegou ao cliente, e a T-217
 * criou um caso em que ela não chegou.** Na REATIVAÇÃO, `primeiroVencimento`
 * empurra a 1ª cobrança para o fim do período já pago — que pode estar a um mês
 * (mensal) ou a um ano (anual) de distância. Nessa janela existe uma cobrança
 * `PENDING`, de cartão, que ninguém viu nem pode pagar adiantado. Manter o
 * `false` ali não protegia nada e produzia o bug real observado pelo dono:
 * cancelou o mensal, reativou, trocou para anual — e a cobrança de setembro
 * continuou no valor MENSAL, com o anual só começando em outubro. Ou seja, quem
 * pediu o plano anual era obrigado a comprar mais um mês avulso antes.
 *
 * ── A regra ──
 *
 * `updatePendingPayments` é um interruptor da **assinatura inteira**, não de uma
 * cobrança: basta uma intocável no meio para o `true` ficar perigoso. Então a
 * conta é feita sobre TODA cobrança ainda não liquidada, e todas precisam ser
 * seguras. Segura é a que cumpre as três:
 *
 * 1. **`status === 'PENDING'`** — allowlist, não blocklist. `OVERDUE`,
 *    `AWAITING_RISK_ANALYSIS` e qualquer status novo que o Asaas invente caem
 *    fora por padrão. A lista de status seguros é curta e conhecida; a de
 *    perigosos, não.
 * 2. **`billingType === 'CREDIT_CARD'`** — é o único meio em que nada está na
 *    mão do cliente. Boleto, Pix e `UNDEFINED` (T-208, o pagador escolhe na
 *    hora) têm `invoiceUrl` viva desde que nascem: pode haver boleto impresso ou
 *    QR de Pix já aberto, que é exatamente o risco que o `false` protege.
 * 3. **Vence DEPOIS de hoje** — cobrança que vence hoje pode estar sendo paga
 *    neste minuto. Um dia de folga custa pouco e remove a corrida.
 *
 * ⚠️ **Passe a lista COMPLETA de cobranças, sem pré-filtrar por status.**
 * Filtrar `status=PENDING` na consulta ao Asaas esconderia justamente uma
 * `OVERDUE` — que o flag reescreveria assim mesmo, sem esta função nunca a ter
 * visto. O filtro é aqui, e é por exclusão do que já liquidou.
 *
 * ⚠️ **Sem cobrança em aberto o retorno é `false`, e isso é de propósito.** O
 * flag seria inócuo (não há o que reescrever), mas devolver `true` faria o
 * chamador anunciar ao cliente uma cobrança atualizada que não existe.
 *
 * ⚠️ **A comparação de datas é no calendário de BRASÍLIA**, via `dataAsaas`: o
 * servidor roda em UTC (§8) e `dueDate` é data pura, que significa meia-noite
 * de Brasília. Comparar em UTC erraria por até 3h — o bastante para tratar como
 * "futura" uma cobrança que já venceu.
 */

/** O que a decisão precisa ler de uma cobrança. Campos crus do Asaas. */
export interface CobrancaPendente {
  status?: string;
  billingType?: string;
  dueDate?: string;
}

/**
 * Status TERMINAIS — o dinheiro já entrou, voltou, ou a cobrança morreu. Não há
 * o que reescrever nelas, então elas não bloqueiam a decisão.
 *
 * ⚠️ Esta lista é curta de propósito, e o desconhecido NÃO entra aqui: status
 * fora dela conta como "em aberto" e, não sendo `PENDING`, derruba a reescrita.
 * Errar para "não mexo" é a direção barata.
 */
const LIQUIDADAS = new Set([
  'RECEIVED',
  'CONFIRMED',
  'RECEIVED_IN_CASH',
  'REFUNDED',
]);

export function podeReescreverCobrancas(
  cobrancas: CobrancaPendente[],
  now: Date = new Date(),
): boolean {
  const emAberto = cobrancas.filter((c) => !LIQUIDADAS.has(c.status ?? ''));
  if (emAberto.length === 0) return false;
  return emAberto.every((c) => cobrancaReescrevivel(c, now));
}

function cobrancaReescrevivel(c: CobrancaPendente, now: Date): boolean {
  if (c.status !== 'PENDING') return false;
  if (c.billingType !== 'CREDIT_CARD') return false;
  const vencimento = dataAsaas(c.dueDate);
  // Data ilegível → trata como intocável. Na dúvida sobre dinheiro do cliente,
  // não mexer é sempre o lado barato do erro.
  if (!vencimento) return false;
  return vencimento.getTime() > now.getTime();
}

/**
 * Vencimento da cobrança em aberto mais próxima — é a partir dela que o plano
 * novo passa a valer quando a reescrita acontece.
 *
 * Sem isto a tela continuaria anunciando o `nextDueDate` da assinatura, que é o
 * ciclo SEGUINTE: diria "anual a partir de outubro" logo depois de reescrever a
 * cobrança de setembro para o valor anual. Dado certo, mês errado.
 */
export function primeiroVencimentoEmAberto(
  cobrancas: CobrancaPendente[],
): Date | null {
  const datas = cobrancas
    .filter((c) => !LIQUIDADAS.has(c.status ?? ''))
    .map((c) => dataAsaas(c.dueDate))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return datas[0] ?? null;
}
