import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { ALLOW_DURING_IMPERSONATION } from './allow-during-impersonation.decorator';

// Métodos que MUTAM estado. Durante a impersonação (T-187) todos são barrados.
const METODOS_MUTACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Somente-leitura durante a impersonação (T-187). Enquanto o admin "vê como" um
// cliente (cookie obrapub_imp → `req.user.impersonatorId` setado), NENHUMA
// mutação passa: default seguro por inversão, impossível esquecer de bloquear um
// endpoint sensível (checkout, exclusão, troca de senha...). Só a leitura roda.
//
// É INTERCEPTOR, não guard, de propósito: um APP_GUARD roda ANTES do JwtAuthGuard
// e não veria `req.user` (mesma razão do SubscriptionGuard ser por-controller,
// CLAUDE.md §8). O interceptor roda depois dos guards, com o usuário já anexado.
//
// A única exceção é `@AllowDuringImpersonation()` (sair da impersonação / logout).
@Injectable()
export class ImpersonationReadOnlyInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser; method?: string }>();

    const impersonando = req.user?.impersonatorId != null;
    const muta = METODOS_MUTACAO.has((req.method ?? 'GET').toUpperCase());

    if (impersonando && muta) {
      const liberado = this.reflector.getAllAndOverride<boolean>(
        ALLOW_DURING_IMPERSONATION,
        [context.getHandler(), context.getClass()],
      );
      if (!liberado) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Ação bloqueada no modo suporte (somente leitura).',
          code: 'impersonation_read_only',
        });
      }
    }

    return next.handle();
  }
}
