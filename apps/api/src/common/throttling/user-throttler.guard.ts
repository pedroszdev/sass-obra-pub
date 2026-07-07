import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Throttle por USUÁRIO autenticado, não por IP (T-104). Para endpoints protegidos
// por JWT em que o abuso vem de UMA conta (custo de IA §3.4, upload) mesmo trocando
// de IP. Chaveia pelo id do usuário do JWT; sem usuário (ex.: rota por token), cai
// no IP. Roda junto do ThrottlerGuard global (por IP) — baldes independentes.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (userId) {
      return Promise.resolve(`user:${userId}`);
    }
    const ips = req.ips as string[] | undefined;
    return Promise.resolve(`ip:${ips?.length ? ips[0] : (req.ip as string)}`);
  }
}
