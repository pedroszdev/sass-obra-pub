// Cronograma físico-financeiro SIMPLES da proposta (BACKLOG T-93; §9 permite a
// versão simples). O empreiteiro distribui a obra em etapas (meses) por
// percentual; o VALOR de cada etapa é derivado do valor global (backend dono do
// cálculo, §3.3 — o front não recalcula). NÃO é o cronograma TCU completo.

export interface EtapaCronograma {
  descricao: string;
  /** Percentual do valor global alocado nesta etapa (0–100). */
  percentual: number;
}

export interface EtapaCronogramaCalculada extends EtapaCronograma {
  /** percentual% × valor global, em reais (derivado). */
  valor: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Deriva o valor (R$) de cada etapa a partir do valor global da proposta.
 *
 * A última etapa recebe o RESÍDUO de arredondamento (T-117c): sem isso, três
 * etapas de 33,33/33,33/33,34% de R$ 100,10 somam R$ 100,09 (≠ global), o que
 * uma comissão aponta. O total alocado respeita a soma real dos percentuais
 * (não força 100%), então sub/super-alocação continua visível — só o ruído de
 * centavo é absorvido pela última etapa.
 */
export function calcularCronograma(
  etapas: EtapaCronograma[] | null | undefined,
  valorGlobal: number,
): EtapaCronogramaCalculada[] {
  const lista = etapas ?? [];
  const totalAlocado = round2((somaPercentual(lista) / 100) * valorGlobal);
  let acumulado = 0;
  return lista.map((e, i) => {
    const ultima = i === lista.length - 1;
    const valor = ultima
      ? round2(totalAlocado - acumulado)
      : round2((e.percentual / 100) * valorGlobal);
    if (!ultima) acumulado = round2(acumulado + valor);
    return { descricao: e.descricao, percentual: e.percentual, valor };
  });
}

/** Soma dos percentuais (deve fechar 100; o front avisa quando não fecha). */
export function somaPercentual(
  etapas: EtapaCronograma[] | null | undefined,
): number {
  return round2((etapas ?? []).reduce((s, e) => s + (e.percentual ?? 0), 0));
}
