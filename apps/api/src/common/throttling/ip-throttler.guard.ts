import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RequestComIp, ipDoClienteOuDesconhecido } from '../ip-cliente';

// Throttle por IP — o guard GLOBAL (T-104), agora lendo o IP pela função única
// do projeto (T-204).
//
// ── Por que esta classe existe, em vez de `getTracker` no ThrottlerModule ──
//
// O `@nestjs/throttler` v6 aceita um `getTracker` nas opções do módulo, e à
// primeira vista seria o lugar óbvio: um só ponto, valendo para todos. **É uma
// armadilha.** O construtor do `ThrottlerGuard` monta
//
//     this.commonOptions = { getTracker: this.options.getTracker, ... }
//     this.commonOptions.getTracker ??= this.getTracker.bind(this)
//
// ou seja: o método `getTracker` da SUBCLASSE só é usado quando o módulo não
// define um. Com `getTracker` no `forRoot`, o `EmailThrottlerGuard` e o
// `UserThrottlerGuard` perderiam os trackers deles (por e-mail e por usuário) e
// passariam todos a contar por IP — matando a segunda dimensão do rate limit,
// que é justamente a que barra brute-force de UMA conta por IPs rotativos. E em
// silêncio: nada quebra, o limite só deixa de proteger o que dizia proteger.
//
// Subclassear mantém cada guard dono do seu tracker.
//
// ⚠️ O padrão da biblioteca é `return req.ip`, que NÃO é `req.ips[0]`: com
// `trust proxy: 1` o `req.ip` é lido da DIREITA do X-Forwarded-For, então nunca
// foi forjável pela esquerda (medido em 29/07 contra produção: 7 logins com XFF
// forjado distinto caíram todos no mesmo balde). O motivo da troca não é
// spoofing — é **atribuição**: com Cloudflare e Render na frente e um único hop
// confiado, `req.ip` pode ser um endereço intermediário, e aí usuários
// diferentes compartilham balde. `CF-Connecting-IP` é o IP do visitante.
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(ipDoClienteOuDesconhecido(req as RequestComIp));
  }
}
