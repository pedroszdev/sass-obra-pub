// Configuração específica da fonte PNCP. Toda a lógica desta fonte fica aqui e
// no conector — nunca vaza para o resto do sistema (CLAUDE.md §3.1).

export const PNCP_BASE_URL =
  'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';

// Modalidades buscadas: Concorrência (onde a obra vive sob a Lei 14.133).
// Guardamos TODOS os resultados destas modalidades, marcando isObra depois
// (CLAUDE.md §3.3). Lista fácil de expandir — ligada ao catálogo da T-09.
export const PNCP_MODALIDADES = [
  4, // Concorrência - Eletrônica
  5, // Concorrência - Presencial
];

export const PNCP_PAGE_SIZE = 50; // máximo permitido pelo PNCP
export const PNCP_PAGE_DELAY_MS = 700; // pausa entre páginas (educado com a API)
export const PNCP_TIMEOUT_MS = 20000;

// Retry básico no 429 — o suficiente para funcionar. O endurecimento
// (Retry-After, throttle entre UFs, resiliência) é a T-13.
export const PNCP_MAX_RETRIES_429 = 5;
export const PNCP_BACKOFF_MS = 3000;
