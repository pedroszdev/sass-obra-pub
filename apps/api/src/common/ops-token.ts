import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

// Token compartilhado de operação (`CAPTACAO_TRIGGER_TOKEN`): protege os ganchos
// de ops (disparo de captação, de notificações, leitura do custo de IA). Não é
// ação de usuário, por isso não usa JWT. Sem token configurado, o gancho fica
// desabilitado (503) — ver CLAUDE.md §8.
//
// A comparação é em TEMPO CONSTANTE (T-153). `!==` sai no primeiro byte diferente,
// e a diferença de tempo vaza quantos caracteres o atacante já acertou — dá para
// descobrir o token byte a byte. O risco prático é baixo (o ruído da rede domina
// a medição), mas a correção custa uma função.
//
// Comparamos os SHA-256 dos dois: o timingSafeEqual exige buffers do MESMO
// tamanho (com tamanhos diferentes ele LANÇA — e o próprio tamanho do token
// vazaria pela exceção). O hash normaliza o comprimento sem enfraquecer nada.
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Valida o token de ops recebido no header contra o configurado no ambiente.
 * 503 se o gancho não está configurado; 401 se o token não confere.
 */
export function assertOpsToken(
  recebido: string | undefined,
  esperado: string | undefined,
  gancho = 'Gancho de operação',
): void {
  if (!esperado) {
    throw new ServiceUnavailableException(
      `${gancho} desabilitado: defina CAPTACAO_TRIGGER_TOKEN.`,
    );
  }
  if (!recebido || !iguaisEmTempoConstante(recebido, esperado)) {
    throw new UnauthorizedException('Token de operação inválido.');
  }
}
