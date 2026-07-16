import type Stripe from 'stripe';

// Planos e comparação de preços (BACKLOG T-131). Puro e testável, no padrão do
// `acesso.ts` — a tela só renderiza o que sai daqui (§3.3).
//
// O VALOR NUNCA MORA AQUI (nem no banco, nem no JSX). Ele vem da Stripe a cada
// leitura: preço escrito do nosso lado divergiria do que a Stripe cobra de fato
// no dia em que o Dashboard mudar, e aí a tela mentiria para o cliente.

export type Plano = 'mensal' | 'anual';

export const PLANOS: readonly Plano[] = ['mensal', 'anual'] as const;

/**
 * O plano de um preço, pelo INTERVALO da recorrência — não pelo `price_id`.
 *
 * Comparar com os ids do config acoplaria esta função pura a variável de
 * ambiente e a deixaria errada no dia em que um price fosse trocado no Dashboard
 * (o id muda; um preço anual segue anual). O intervalo se descreve sozinho.
 *
 * `null` = recorrência que não vendemos (semanal, trimestral...). Quem chama
 * decide o que fazer — não inventamos um plano para caber.
 */
export function planoDoIntervalo(
  interval: Stripe.Price.Recurring.Interval | undefined,
  intervalCount = 1,
): Plano | null {
  if (intervalCount !== 1) return null;
  if (interval === 'month') return 'mensal';
  if (interval === 'year') return 'anual';
  return null;
}

/** Um preço como a tela precisa vê-lo. `valor` em CENTAVOS (a unidade da Stripe). */
export interface PrecoPlano {
  plano: Plano;
  priceId: string;
  /** Centavos. Dividir por 100 é problema de formatação, não de domínio. */
  valor: number;
  moeda: string;
}

export interface ComparacaoPlanos {
  mensal: PrecoPlano;
  anual: PrecoPlano;
  /** Centavos economizados no ano ao pagar anual em vez de 12x o mensal. */
  economiaAnual: number;
  /** Quantos meses o desconto anual "paga" — 0 quando não há economia. */
  mesesGratis: number;
}

/**
 * Compara os dois planos. `null` quando o anual não é vantajoso: nesse caso a
 * tela não deve prometer economia nenhuma.
 *
 * `mesesGratis` arredonda para BAIXO de propósito. Uma economia de 1,8 mês vira
 * "1 mês grátis" — prometer 2 seria vender o que não entregamos. Subestimar é
 * seguro; superestimar é propaganda enganosa.
 */
export function compararPlanos(
  mensal: PrecoPlano,
  anual: PrecoPlano,
): ComparacaoPlanos | null {
  const cheio = mensal.valor * 12;
  const economiaAnual = cheio - anual.valor;
  if (economiaAnual <= 0) return null;
  return {
    mensal,
    anual,
    economiaAnual,
    mesesGratis:
      mensal.valor > 0 ? Math.floor(economiaAnual / mensal.valor) : 0,
  };
}
