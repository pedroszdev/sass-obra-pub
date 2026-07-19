import type { ThrottlerOptions } from '@nestjs/throttler';

// Rate limiting (T-104). Janela de 1 minuto para todos os níveis; só muda o teto.
// Centralizado aqui para ficar fácil de calibrar (§3.3 espírito: regra num lugar só).
const JANELA_MS = 60_000;

// Limite global frouxo — rede de segurança em toda a API (por IP). A navegação
// normal (buscar editais, favoritos, etc.) nunca chega perto.
export const THROTTLE_GLOBAL: ThrottlerOptions = {
  name: 'default',
  ttl: JANELA_MS,
  limit: 100,
};

// Tetos por rota (aplicados via @Throttle sobre o throttler 'default'). Cada um é
// um override do limite global para aquela rota — ver o mapa da T-104.
export const THROTTLE = {
  // Auth sensível: brute-force de senha + exaustão de CPU no bcrypt.
  AUTH: { default: { ttl: JANELA_MS, limit: 5 } },
  // Ações que DISPARAM E-MAIL (reenvio de verificação — T-171). Mais apertado
  // que AUTH: 5 e-mails/min ainda é spam (custo do provedor, risco de abuso). O
  // front ainda dá um cooldown visível; este é o teto duro por usuário/IP.
  EMAIL: { default: { ttl: JANELA_MS, limit: 2 } },
  // Refresh tem folga: o cold start do Render pode disparar alguns em sequência.
  REFRESH: { default: { ttl: JANELA_MS, limit: 10 } },
  // Endpoints que disparam IA on-demand na 1ª chamada (custo OpenAI §3.4).
  IA: { default: { ttl: JANELA_MS, limit: 30 } },
  // Upload de PDF → bytea (enche o banco) e captação pesada.
  UPLOAD: { default: { ttl: JANELA_MS, limit: 20 } },
  CAPTACAO: { default: { ttl: JANELA_MS, limit: 10 } },
} as const;
