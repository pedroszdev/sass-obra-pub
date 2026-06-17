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

// Retry robusto por página: re-tenta 429 (honrando Retry-After), 5xx e
// timeouts/erros de rede, com backoff exponencial + jitter até desistir.
export const PNCP_MAX_ATTEMPTS = 6; // tentativas por página antes de falhar
export const PNCP_BASE_BACKOFF_MS = 1000; // 1ª espera (dobra a cada tentativa)
export const PNCP_MAX_BACKOFF_MS = 30000; // teto da espera
