// Defaults da captação (sobrescrevíveis por env).
// Backfill: ao ativar uma UF nova, quantos dias para trás buscar de uma vez.
export const CAPTACAO_BACKFILL_DAYS_DEFAULT = 30;
// Overlap: na sincronização incremental, re-buscar os últimos N dias para
// pegar editais que chegaram atrasados na fonte.
export const CAPTACAO_OVERLAP_DAYS_DEFAULT = 2;
