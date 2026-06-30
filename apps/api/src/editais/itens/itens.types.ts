// Tipos da extração da planilha orçamentária do edital por IA (BACKLOG T-64).
// O preço de referência é SEM BDI (custo direto) — o spike T-63 confirmou que a
// IA pega a coluna certa; o BDI é aplicado depois pelo motor de cálculo (T-66/67).

export interface ItemPlanilha {
  /** Código do item na planilha (SINAPI/SICRO/composição), se houver. */
  codigo: string | null;
  descricao: string;
  /** Unidade de medida (m², m³, vb, kg…). */
  unidade: string | null;
  quantidade: number | null;
  /** Preço unitário de referência (custo direto, SEM BDI). null se a planilha não traz preços. */
  precoReferencia: number | null;
}

export interface ExtracaoItensIa {
  /** false quando o texto não contém uma planilha de itens (só o edital, etc.). */
  temPlanilha: boolean;
  itens: ItemPlanilha[];
}

// Resultado da extração + uso (tokens/custo) para o cache/auditoria (§3.4).
export interface ExtracaoItensComUso {
  resultado: ExtracaoItensIa;
  promptTokens: number;
  completionTokens: number;
  custoUsd: number;
}
