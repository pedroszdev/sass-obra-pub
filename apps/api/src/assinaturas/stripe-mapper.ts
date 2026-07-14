import type Stripe from 'stripe';
import { AssinaturaStatus } from './assinatura-status.enum';

// Traduz a assinatura DA STRIPE para o nosso estado (BACKLOG T-129). Puro e
// testável: é a peça que decide, no fim das contas, quem tem acesso ao produto.

export interface EstadoVindoDaStripe {
  status: AssinaturaStatus;
  currentPeriodEnd: Date | null;
  /** Setado quando entra em past_due; limpo quando volta a pagar. */
  pastDueDesde: Date | null;
  stripeSubscriptionId: string;
}

/**
 * Status da Stripe → o nosso. `null` = NÃO MEXER no estado local.
 *
 * `incomplete` é o caso que exige cuidado: é a assinatura cuja PRIMEIRA cobrança
 * ainda não foi paga. Traduzi-la para "sem pagamento" derrubaria alguém que está
 * no MEIO DO TRIAL e apenas começou a digitar o cartão. Enquanto ela não se
 * resolve (vira `active` ou `incomplete_expired`), o estado local — o trial —
 * continua valendo.
 */
export function mapStatusStripe(
  status: Stripe.Subscription.Status,
): AssinaturaStatus | null {
  switch (status) {
    case 'active':
    // A Stripe só reporta `trialing` se o trial fosse DELA — o nosso é local
    // (T-127) e não mandamos `trial_period_days`. Se aparecer, é acesso liberado.
    case 'trialing':
      return AssinaturaStatus.ACTIVE;

    // Cobrança falhou e a Stripe está retentando (dunning). `unpaid` é o fim da
    // linha das retentativas — para nós os dois significam "não pagou", e a
    // carência (T-127/T-130) decide quando bloquear de fato.
    case 'past_due':
    case 'unpaid':
      return AssinaturaStatus.PAST_DUE;

    case 'canceled':
    case 'incomplete_expired':
      return AssinaturaStatus.CANCELED;

    // Trial da Stripe que acabou sem meio de pagamento. Não usamos trial na
    // Stripe, mas se cair aqui é o mesmo que "não está pagando".
    case 'paused':
      return AssinaturaStatus.PAST_DUE;

    case 'incomplete':
      return null; // não mexe: o trial local pode estar valendo
  }
}

/**
 * Fim do período pago.
 *
 * ATENÇÃO: `current_period_end` **não é mais campo do topo** da assinatura — a
 * Stripe o moveu para dentro dos ITENS. Código escrito de memória lê `undefined`
 * aqui e grava `null`, e aí quem cancela perde o acesso na hora em vez de mantê-lo
 * até o fim do que pagou. Lemos do item (e ainda aceitamos o campo antigo, para
 * o caso de a conta estar fixada numa versão velha da API).
 */
export function extrairFimDoPeriodo(sub: Stripe.Subscription): Date | null {
  const doItem = sub.items?.data?.[0]?.current_period_end;
  const legado = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const unix = doItem ?? legado;
  return typeof unix === 'number' ? new Date(unix * 1000) : null;
}

/** Estado completo a aplicar no nosso banco. `null` = evento não muda nada. */
export function estadoDaAssinatura(
  sub: Stripe.Subscription,
  now: Date = new Date(),
): EstadoVindoDaStripe | null {
  const status = mapStatusStripe(sub.status);
  if (!status) return null;
  return {
    status,
    currentPeriodEnd: extrairFimDoPeriodo(sub),
    pastDueDesde: status === AssinaturaStatus.PAST_DUE ? now : null,
    stripeSubscriptionId: sub.id,
  };
}

/** O `userId` que carimbamos no Checkout (T-128). Sem ele não sabemos o dono. */
export function userIdDaSubscription(sub: Stripe.Subscription): string | null {
  return sub.metadata?.userId ?? null;
}
