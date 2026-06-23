// Defaults da captação (sobrescrevíveis por env).
// Backfill: ao ativar uma UF nova, quantos dias para trás buscar de uma vez.
export const CAPTACAO_BACKFILL_DAYS_DEFAULT = 30;
// Overlap: na sincronização incremental, re-buscar os últimos N dias para
// pegar editais que chegaram atrasados na fonte.
export const CAPTACAO_OVERLAP_DAYS_DEFAULT = 2;
// Sob demanda (T-34): uma UF é considerada "velha" (e a busca redispara a
// captação) se o watermark tiver mais que estas horas. Evita rebuscar a fonte
// a cada busca quando o dado já é recente.
export const CAPTACAO_ONDEMAND_STALE_HOURS_DEFAULT = 24;
