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
// Re-sync por situação (T-114): a cada ciclo, quantos dias de dataAtualizacao
// olhar para trás no endpoint de atualização do PNCP. Precisa cobrir a janela
// entre publicação e uma eventual anulação/revogação enquanto o prazo está
// aberto. Sem watermark próprio — a janela fixa é idempotente (upsert) e robusta
// à hibernação do Render (um dia pulado não abre buraco).
export const CAPTACAO_RESYNC_DAYS_DEFAULT = 45;
// Backfill progressivo (T-98): na 1ª captação de uma UF nova, um passe rápido
// busca só estes últimos dias primeiro — poucos registros, janela recente —
// para os primeiros editais aparecerem na busca sem esperar o backfill inteiro.
// O passe completo (BACKFILL_DAYS) roda logo em seguida e preenche o resto.
export const CAPTACAO_ONDEMAND_QUICK_DAYS_DEFAULT = 7;
