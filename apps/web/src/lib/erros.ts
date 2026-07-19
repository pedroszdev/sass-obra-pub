// Mensagens de erro amigáveis (T-170).
//
// O `ApiError.message` carrega o texto que o backend mandou no corpo. Mensagens
// de DOMÍNIO já vêm curadas em PT-BR ("E-mail já cadastrado", "Proposta fora de
// rascunho é somente leitura") e devem aparecer como estão. O que NÃO pode
// chegar à tela é o texto de framework em inglês: `ThrottlerException: Too Many
// Requests` (429), `Validation failed (uuid is expected)` (400 de id malformado),
// `Internal server error` (5xx). Este helper roda na origem (`extractMessage`,
// api.ts), então todo ponto que exibe `err.message` já recebe o texto tratado.

// Vazamentos conhecidos de framework (NestJS/class-validator) — texto em inglês
// que o backend não curou. Se um destes casar, trocamos por uma frase genérica.
const VAZAMENTOS_FRAMEWORK = [
  /validation failed/i,
  /is expected/i, // "uuid is expected"
  /throttlerexception/i,
  /internal server error/i,
  /bad request( exception)?/i,
  /\bmust be\b/i, // "X must be a number/string/..."
  /\bmust not\b/i, // "X must not be less than 0"
  /\bshould not\b/i,
  /cannot (get|post|put|patch|delete)/i,
];

const MSG_RATE_LIMIT =
  'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.';
const MSG_SERVIDOR = 'Instabilidade no servidor. Tente de novo em instantes.';
const MSG_GENERICA =
  'Não foi possível processar a solicitação. Verifique os dados e tente de novo.';

/**
 * Traduz uma mensagem crua da API para PT-BR amigável a partir do status.
 * Mensagens de domínio já em PT-BR passam intactas; só os vazamentos de
 * framework (e 429/5xx) são substituídos.
 */
export function amigavel(status: number, mensagemCrua: string): string {
  if (status === 429) return MSG_RATE_LIMIT;
  if (status >= 500) return MSG_SERVIDOR;
  const crua = mensagemCrua?.trim() ?? '';
  if (!crua) return MSG_GENERICA;
  if (VAZAMENTOS_FRAMEWORK.some((re) => re.test(crua))) return MSG_GENERICA;
  return crua;
}
