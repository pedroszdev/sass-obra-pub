// Seleção da planilha orçamentária entre os documentos do edital (T-64).
// É o INVERSO da seleção de exigências (T-48): lá excluíamos planilha/orçamento
// para achar o EDITAL; aqui pontuamos justamente a planilha de itens. Pesos e
// exclusões validados no spike T-63 (evita falsos positivos: ART, BDI,
// composições, banco de preços, cronograma, cotação, memorial, minuta…).

const REGEX_EXCLUI =
  /composi|\bbdi\b|banco.?de.?pre[çc]|cronograma|\bart\b|\brrt\b|\btrt\b|pesquisa.?de.?pre[çc]|cota[çc]|c[áa]lculo|blindagem|licitante|\bmodelo\b|memorial|\betp\b|estudo.?t[ée]cnico|termo.?de.?refer|minuta/i;

/**
 * Pontua o nome de um documento como candidato a planilha orçamentária.
 *  3 = "planilha orçamentária/quantitativos/preços" ou "orçamento sintético"
 *  2 = "orçamento"
 *  1 = "planilha" / "quantitativo"
 *  0 = neutro (ex.: o próprio edital) · -1 = falso positivo conhecido (excluir)
 */
export function scorePlanilhaNome(nome: string | null | undefined): number {
  const n = nome ?? '';
  if (REGEX_EXCLUI.test(n)) return -1;
  if (
    /planilha.*(or[çc]ament|quantitat|pre[çc]o)|or[çc]ament.*sint[ée]t/i.test(n)
  )
    return 3;
  if (/\bor[çc]amento\b/i.test(n)) return 2;
  if (/planilha|quantitativ/i.test(n)) return 1;
  return 0;
}

/** Desempate por formato quando o score empata: xlsx > pdf > xls. */
export function rankFormato(tipo: string): number {
  return tipo === 'xlsx' ? 2 : tipo === 'pdf' ? 1 : 0;
}
