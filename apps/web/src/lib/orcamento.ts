// Guardas numéricas do editor de orçamento.
//
// T-166 (congelamento): digitar um BDI negativo (ex.: -50) e sair do campo
// mandava o valor cru para a API, que respondia 400 (rejeição correta do
// backend, §3.3) — e era esse caminho de erro, com o re-render da planilha
// inteira, que travava a aba. O front passa a NUNCA fazer esse round-trip:
// clampa o valor para a faixa que o backend aceita antes de enviar. O backend
// segue sendo a fonte da verdade — isto só evita que um erro de digitação
// vire uma requisição 400.
//
// A faixa espelha os validadores do `UpdatePropostaDto`:
//   bdiPercentual  → @Min(0) @Max(999.99), numeric(5,2)
//   precoUnitario/quantidade → @Min(0)

export const BDI_MIN = 0;
export const BDI_MAX = 999.99;

/**
 * Valor de BDI seguro para enviar à API: dentro de [0, 999.99] e com no máximo
 * 2 casas decimais (o backend exige `maxDecimalPlaces: 2`). Entrada não
 * numérica (`NaN`) vira 0.
 */
export function clampBdi(valor: number): number {
  if (!Number.isFinite(valor)) return BDI_MIN;
  const limitado = Math.min(BDI_MAX, Math.max(BDI_MIN, valor));
  // Arredonda para 2 casas — sem isto, 12.345 dispararia o 400 de
  // `maxDecimalPlaces` mesmo dentro da faixa.
  return Math.round(limitado * 100) / 100;
}

/**
 * Preço/quantidade nunca negativos (mesma classe de erro do BDI: o backend
 * recusa < 0 com 400). Preserva `null` (campo vazio = "sem valor", não zero).
 */
export function naoNegativo(valor: number | null): number | null {
  if (valor == null || !Number.isFinite(valor)) return valor;
  return valor < 0 ? 0 : valor;
}
