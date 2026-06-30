// Motor de cálculo da proposta (BACKLOG T-66). Função pura e testável — o
// backend é o dono do cálculo (CLAUDE.md §3.3): o front só renderiza, nunca
// recalcula, pra tela e sistema não divergirem. Os totais NÃO são persistidos;
// derivam de qtd × preço + BDI sempre que pedidos.
//
// Modelo simples (Épico 6, §9): custo direto = Σ(qtd × preço unitário) e o BDI
// é um PERCENTUAL único aplicado sobre o custo direto (T-67). Sem composições
// analíticas nem BDI decomposto — isso é evolução, não escopo agora.

export interface CalculoItemInput {
  quantidade: number | null;
  precoUnitario: number | null;
}

export interface CalculoInput {
  itens: CalculoItemInput[];
  /** BDI em pontos percentuais (ex.: 25.5 = 25,5%). null/ausente = 0. */
  bdiPercentual: number | null;
}

export interface ItemCalculo {
  /** qtd × preço unitário, em reais (2 casas). 0 quando falta qtd ou preço. */
  subtotal: number;
  /** true quando o item ainda não tem preço unitário preenchido (T-68). */
  semPreco: boolean;
}

export interface PropostaCalculo {
  itens: ItemCalculo[];
  /** Σ dos subtotais (custo direto, sem BDI). */
  custoDireto: number;
  /** BDI efetivamente aplicado (0 quando não definido). */
  bdiPercentual: number;
  /** Valor do BDI em reais (valorGlobal − custoDireto). */
  valorBdi: number;
  /** Valor global da proposta = custo direto + BDI (o preço com BDI aplicado). */
  valorGlobal: number;
  totalItens: number;
  /** Quantos itens ainda estão sem preço (a precificar). */
  itensSemPreco: number;
}

/** Arredonda para centavos (2 casas), evitando ruído de ponto flutuante. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula os totais da proposta a partir dos itens e do BDI.
 *
 * Cada subtotal é arredondado a centavos antes de somar (como na planilha, em
 * que a linha já vem arredondada) — o custo direto é a soma dessas linhas.
 * Item sem quantidade ou sem preço contribui 0 (não vira NaN) e é sinalizado.
 */
export function calcularProposta(input: CalculoInput): PropostaCalculo {
  const itens: ItemCalculo[] = input.itens.map((it) => {
    const semPreco = it.precoUnitario == null;
    const qtd = it.quantidade ?? 0;
    const preco = it.precoUnitario ?? 0;
    return { subtotal: round2(qtd * preco), semPreco };
  });

  const custoDireto = round2(itens.reduce((soma, it) => soma + it.subtotal, 0));
  const bdiPercentual = input.bdiPercentual ?? 0;
  const valorBdi = round2(custoDireto * (bdiPercentual / 100));
  const valorGlobal = round2(custoDireto + valorBdi);

  return {
    itens,
    custoDireto,
    bdiPercentual,
    valorBdi,
    valorGlobal,
    totalItens: itens.length,
    itensSemPreco: itens.filter((it) => it.semPreco).length,
  };
}
