import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { capturarErro } from '../common/observabilidade';
import { AdminAuditService } from './admin-audit.service';
import { AUDIT_KEY } from './audit.decorator';
import { resumirPayload } from './admin-audit.redact';

interface RequestLike {
  method: string;
  originalUrl?: string;
  url: string;
  params?: Record<string, string>;
  body?: unknown;
  ip?: string;
  ips?: string[];
  user?: AuthenticatedUser;
}

interface ResponseLike {
  statusCode: number;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Auditoria por padrão do backoffice (T-182). Aplicado por controller do admin
// (@UseInterceptors), NÃO global — fica escopado ao módulo, como o AdminGuard.
//
// Regra: audita SEMPRE mutação (POST/PUT/PATCH/DELETE); audita GET só se a rota
// tiver @Audit() (é assim que o detalhe de conta da T-184 se registra — acesso a
// dado pessoal precisa ser rastreável, LGPD). Grava no sucesso E no erro (o
// status conta a história). A gravação NUNCA derruba a requisição: a ação já
// aconteceu, então uma falha ao logar vai para o Sentry, não para o cliente.
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditoria: AdminAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<RequestLike>();
    const res = http.getResponse<ResponseLike>();

    const anotacao = this.reflector.getAllAndOverride<
      string | boolean | undefined
    >(AUDIT_KEY, [context.getHandler(), context.getClass()]);
    const mutacao = MUTATING.has(req.method);

    // GET sem @Audit não é auditado; mutação é sempre.
    if (!mutacao && !anotacao) {
      return next.handle();
    }

    const acaoExplicita = typeof anotacao === 'string' ? anotacao : undefined;

    const gravar = (statusCode: number): void => {
      // Sem usuário não deveria acontecer (guards antes), mas nunca gravamos um
      // registro órfão — o adminUserId é o cerne da trilha.
      if (!req.user) return;
      void this.auditoria
        .registrar({
          adminUserId: req.user.id,
          action: acaoExplicita ?? `${req.method} ${this.rota(req)}`,
          method: req.method,
          path: this.rota(req),
          targetId: req.params?.id ?? null,
          statusCode,
          ip: this.ip(req),
          summary: mutacao ? resumirPayload(req.body) : null,
        })
        .catch((e: unknown) =>
          capturarErro(e, 'admin-audit', { action: acaoExplicita }),
        );
    };

    return next.handle().pipe(
      tap({
        next: () => gravar(res.statusCode),
        // Erro: registra a tentativa com o status da exceção (default 500).
        error: (err: unknown) => {
          const status =
            (err as { status?: number; statusCode?: number })?.status ??
            (err as { statusCode?: number })?.statusCode ??
            500;
          gravar(status);
        },
      }),
    );
  }

  private rota(req: RequestLike): string {
    // originalUrl traz a querystring; ficamos só com o path.
    const bruto = req.originalUrl ?? req.url;
    return bruto.split('?')[0];
  }

  private ip(req: RequestLike): string | null {
    // Mesmo critério do throttling: confia no 1º de x-forwarded-for (Render).
    return req.ips?.length ? req.ips[0] : (req.ip ?? null);
  }
}
