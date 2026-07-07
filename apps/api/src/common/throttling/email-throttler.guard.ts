import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Throttle por EMAIL, não por IP (T-104). Limita o brute-force contra UMA conta
// mesmo que o atacante rotacione de IP — o que o limite por IP não pega. Roda
// junto do ThrottlerGuard global (por IP) na rota de login: os dois contam em
// baldes independentes (a chave inclui o tracker), o que estourar primeiro barra.
// O email é normalizado (trim/lowercase) e guardado como hash — nunca em claro.
@Injectable()
export class EmailThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as { email?: unknown } | undefined;
    const bruto = typeof body?.email === 'string' ? body.email : '';
    const email = bruto.trim().toLowerCase();
    if (!email) {
      // Sem email no corpo (requisição malformada): conta pelo IP mesmo assim.
      return Promise.resolve(`ip:${ipDe(req)}`);
    }
    const hash = createHash('sha256').update(email).digest('hex');
    return Promise.resolve(`email:${hash}`);
  }
}

// IP respeitando o proxy (X-Forwarded-For) — ver `trust proxy` no main.ts.
function ipDe(req: Record<string, unknown>): string {
  const ips = req.ips as string[] | undefined;
  return ips?.length ? ips[0] : (req.ip as string);
}
