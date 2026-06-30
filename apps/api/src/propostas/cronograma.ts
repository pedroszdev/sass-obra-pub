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

/** Deriva o valor (R$) de cada etapa a partir do valor global da proposta. */
export function calcularCronograma(
  etapas: EtapaCronograma[] | null | undefined,
  valorGlobal: number,
): EtapaCronogramaCalculada[] {
  return (etapas ?? []).map((e) => ({
    descricao: e.descricao,
    percentual: e.percentual,
    valor: round2((e.percentual / 100) * valorGlobal),
  }));
}

/** Soma dos percentuais (deve fechar 100; o front avisa quando não fecha). */
export function somaPercentual(
  etapas: EtapaCronograma[] | null | undefined,
): number {
  return round2((etapas ?? []).reduce((s, e) => s + (e.percentual ?? 0), 0));
}
