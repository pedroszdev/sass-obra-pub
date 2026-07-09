// Validação de ambiente no boot (T-104). Sem Joi/dep nova: função pura passada ao
// ConfigModule.forRoot({ validate }). Se algo obrigatório falta, o processo NÃO
// sobe — mata a classe de falha "deploy verde caindo em defaults localhost/obrapub"
// (o TypeOrm tem defaults de dev em app.module.ts; em prod isso é perigoso).

// Sempre obrigatórios: sem os segredos de JWT, auth quebra em runtime (getOrThrow),
// e um segredo ausente/curto é falha de segurança, não de conveniência.
const SEMPRE_OBRIGATORIOS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

// Só em produção: em dev os defaults (localhost/obrapub/Vite) são convenientes;
// em prod cair neles é bug silencioso (banco errado, CORS aberto pro dev).
const OBRIGATORIOS_EM_PROD = [
  'DATABASE_HOST',
  'DATABASE_PASSWORD',
  'WEB_ORIGIN',
] as const;

// OPENAI_API_KEY, CAPTACAO_TRIGGER_TOKEN e GOOGLE_CLIENT_ID são OPCIONAIS de
// propósito: a IA, o gatilho manual e o login com Google degradam com 503 quando
// ausentes (não derrubam o boot). O produto funciona sem qualquer um dos três.

const preenchido = (v: unknown): boolean =>
  typeof v === 'string' && v.trim().length > 0;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const faltando: string[] = [];

  for (const chave of SEMPRE_OBRIGATORIOS) {
    if (!preenchido(config[chave])) faltando.push(chave);
  }

  if (config.NODE_ENV === 'production') {
    for (const chave of OBRIGATORIOS_EM_PROD) {
      if (!preenchido(config[chave])) faltando.push(chave);
    }
  }

  if (faltando.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${faltando.join(', ')}. ` +
        `Defina-as antes de subir a API (ver CLAUDE.md §8).`,
    );
  }

  return config;
}
