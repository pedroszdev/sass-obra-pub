import { SetMetadata } from '@nestjs/common';

export const TURNSTILE_ACTION_KEY = 'turnstile_action';

/**
 * Nomeia a ação do Turnstile da rota (T-203). O mesmo valor tem de estar no
 * `data-action` do widget no front — é isso que o `avaliarSiteverify` confere,
 * para que um token emitido numa tela não valha em outra.
 *
 * Obrigatório onde o `TurnstileGuard` estiver aplicado: sem metadata o guard
 * RECUSA (não há ação para comparar, e passar sem comparar seria enfraquecer a
 * verificação por esquecimento). Regras da Cloudflare para o valor: 1–32 chars,
 * só letras, números, `_` ou `-`.
 */
export const Turnstile = (action: string) =>
  SetMetadata(TURNSTILE_ACTION_KEY, action);
