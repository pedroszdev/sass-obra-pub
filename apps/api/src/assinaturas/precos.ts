// Planos e comparação de preços (BACKLOG T-131). Puro e testável, no padrão do
// `acesso.ts` — a tela só renderiza o que sai daqui (§3.3).
//
// O VALOR NUNCA MORA AQUI (nem no JSX). Ele vem do config store a cada leitura
// (T-213), editável em /admin → Config: preço escrito no código divergiria do
// cobrado no dia em que mudasse, e a tela mentiria para o cliente.
//
// 📌 A regra original era "vem da Stripe, nunca do nosso lado". O Asaas não tem
// catálogo de `Price`, então o preço passou a ser nosso — mas o ESPÍRITO
// sobreviveu: muda sem deploy e com registro de quem mudou.

export type Plano = 'mensal' | 'anual';

export const PLANOS: readonly Plano[] = ['mensal', 'anual'] as const;

// 📌 `planoDoIntervalo` saiu no corte (T-224): lia o `recurring.interval` de um
// `Price` da Stripe. O equivalente é o `planoDoCiclo` de `asaas-mapper.ts`, que
// lê o `cycle` do Asaas.

/** Um preço como a tela precisa vê-lo. `valor` em CENTAVOS. */
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
 *
 * MOEDAS DIFERENTES NÃO SE SUBTRAEM (T-164). Os dois preços são lidos de prices
 * independentes do Dashboard, e nada lá obriga os dois a usarem a mesma moeda.
 * Um mensal em BRL contra um anual em USD produziria um número que não significa
 * nada — e a tela o anunciaria como economia, com o símbolo de uma das duas.
 * É a mesma cautela que o `buscarPreco` já tem ao barrar o price cujo intervalo
 * não corresponde ao plano: preferimos não prometer nada a prometer errado.
 */
export function compararPlanos(
  mensal: PrecoPlano,
  anual: PrecoPlano,
): ComparacaoPlanos | null {
  if (mensal.moeda !== anual.moeda) return null;
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

/**
 * Resposta de preços das telas (T-131).
 *
 * ⚠️ Morava em `stripe-billing.service.ts` e mudou de casa no corte (T-224):
 * é tipo de DOMÍNIO — "quanto custa cada plano" — e não tinha por que viver
 * dentro de um provedor. A FORMA é a mesma que a Stripe devolvia; a FONTE hoje é
 * o config store (T-213), porque o Asaas não tem catálogo de preços.
 */
export interface PrecosResponse {
  mensal: PrecoPlano;
  anual: PrecoPlano;
  /** Centavos economizados no ano. `null` = o anual não compensa. */
  economiaAnual: number | null;
  /** Meses que o desconto anual paga. `null` = o anual não compensa. */
  mesesGratis: number | null;
}
