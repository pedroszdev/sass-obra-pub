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
  /** Teto do edital (orçamento de referência). null/0 = sem comparação (T-69). */
  valorReferencia?: number | null;
}

// Comparação da proposta com o teto do edital (T-69) — o diferencial.
export interface ComparacaoTeto {
  valorReferencia: number;
  /** teto − valor global. Positivo = abaixo do teto (folga); negativo = acima. */
  economia: number;
  /** valor global como % do teto (arredondado). */
  percentualDoTeto: number;
  /** quanto a proposta está abaixo (+) ou acima (−) do teto, em pontos % (arredondado). */
  diferencaPercentual: number;
  abaixoDoTeto: boolean;
}

export interface ItemCalculo {
  /** qtd × preço unitário, em reais (2 casas). 0 quando falta qtd ou preço. */
  subtotal: number;
  /** true quando o item ainda não tem preço unitário preenchido (T-68). */
  semPreco: boolean;
  /**
   * true quando o item TEM preço mas não tem quantidade útil (qtd nula/≤0) — soma
   * 0 em silêncio (T-117a). Distinto de `semPreco`: aqui o preço está lá, o que
   * falta é a quantidade, e sem sinal a proposta sai subestimada.
   */
  incompleto: boolean;
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
  /** Quantos itens têm preço mas não têm quantidade útil — somam 0 (T-117a). */
  itensIncompletos: number;
  /** Relação com o teto do edital (T-69). null quando não há valor de referência. */
  comparacao: ComparacaoTeto | null;
}

/** Arredonda para centavos (2 casas), evitando ruído de ponto flutuante. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Subtotal (R$) de um item em CENTAVOS INTEIROS (T-117e). qtd tem até 4 casas e
 * preço até 2 — multiplicar como float perde o meio-centavo (ex.: 0,0005 vira
 * 0,00). Convertendo para inteiros (milésimos de unidade × centavos) a conta é
 * exata. 0 quando falta qtd útil ou preço.
 */
function subtotalReais(
  quantidade: number | null,
  precoUnitario: number | null,
): number {
  if (precoUnitario == null || quantidade == null) return 0;
  if (precoUnitario <= 0 || quantidade <= 0) return 0;
  const qMilesimos = Math.round(quantidade * 10_000);
  const pCentavos = Math.round(precoUnitario * 100);
  const centavos = Math.round((qMilesimos * pCentavos) / 10_000);
  return centavos / 100;
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
    const qtdInvalida = it.quantidade == null || it.quantidade <= 0;
    return {
      subtotal: subtotalReais(it.quantidade, it.precoUnitario),
      semPreco,
      incompleto: !semPreco && qtdInvalida,
    };
  });

  const custoDireto = round2(itens.reduce((soma, it) => soma + it.subtotal, 0));
  const bdiPercentual = input.bdiPercentual ?? 0;
  const valorBdi = round2(custoDireto * (bdiPercentual / 100));
  const valorGlobal = round2(custoDireto + valorBdi);

  const teto = input.valorReferencia ?? 0;
  // Ao estourar o teto, o arredondamento inteiro não pode mascarar a
  // desclassificação: força ≥101% e ≤−1pp para nunca exibir "100% / 0%" (T-117e).
  const acima = valorGlobal > teto;
  const comparacao: ComparacaoTeto | null =
    teto > 0
      ? {
          valorReferencia: teto,
          economia: round2(teto - valorGlobal),
          percentualDoTeto: acima
            ? Math.max(101, Math.round((valorGlobal / teto) * 100))
            : Math.round((valorGlobal / teto) * 100),
          diferencaPercentual: acima
            ? Math.min(-1, Math.round(((teto - valorGlobal) / teto) * 100))
            : Math.round(((teto - valorGlobal) / teto) * 100),
          abaixoDoTeto: !acima,
        }
      : null;

  return {
    itens,
    custoDireto,
    bdiPercentual,
    valorBdi,
    valorGlobal,
    totalItens: itens.length,
    itensSemPreco: itens.filter((it) => it.semPreco).length,
    itensIncompletos: itens.filter((it) => it.incompleto).length,
    comparacao,
  };
}
