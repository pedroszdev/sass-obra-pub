import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AdminAuditInterceptor } from '../src/admin/admin-audit.interceptor';
import { AdminAuditService } from '../src/admin/admin-audit.service';

// A auditoria (T-182) é a defesa do dono: se ela deixar de gravar uma mutação,
// uma ação sensível fica invisível; se gravar o body cru, vaza PII no log. Os
// testes travam as duas pontas + a regra "GET só com @Audit".

interface ReqOpts {
  method: string;
  url?: string;
  params?: Record<string, string>;
  body?: unknown;
  ip?: string;
  ips?: string[];
  user?: { id: string; role: string } | undefined;
}

function ctx(req: ReqOpts, statusCode = 200): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ statusCode }),
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function build(anotacao?: string | boolean) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(anotacao),
  } as unknown as Reflector;
  const service = { registrar: jest.fn().mockResolvedValue(undefined) };
  const interceptor = new AdminAuditInterceptor(
    reflector,
    service as unknown as AdminAuditService,
  );
  return { interceptor, service };
}

const handler = (obs: unknown): CallHandler =>
  ({ handle: () => obs }) as unknown as CallHandler;

const ADMIN = { id: 'a1', role: 'ADMIN' };

describe('AdminAuditInterceptor (T-182)', () => {
  it('grava mutação com summary redigido e o alvo (:id)', async () => {
    const { interceptor, service } = build();
    await firstValueFrom(
      interceptor.intercept(
        ctx({
          method: 'POST',
          url: '/admin/accounts/u9/cortesia?x=1',
          params: { id: 'u9' },
          body: { dias: 7, password: 'x' },
          ips: ['200.1.1.1'],
          user: ADMIN,
        }),
        handler(of({ ok: true })),
      ),
    );
    expect(service.registrar).toHaveBeenCalledTimes(1);
    const r = service.registrar.mock.calls[0][0];
    expect(r.adminUserId).toBe('a1');
    expect(r.method).toBe('POST');
    expect(r.path).toBe('/admin/accounts/u9/cortesia'); // sem querystring
    expect(r.targetId).toBe('u9');
    expect(r.ip).toBe('200.1.1.1'); // 1º do x-forwarded-for
    expect(r.summary).toEqual({ dias: 7, password: '[redigido]' });
  });

  it('NÃO audita GET sem @Audit', async () => {
    const { interceptor, service } = build(undefined);
    await firstValueFrom(
      interceptor.intercept(
        ctx({ method: 'GET', url: '/admin/audit', user: ADMIN }),
        handler(of([])),
      ),
    );
    expect(service.registrar).not.toHaveBeenCalled();
  });

  it('audita GET anotado com @Audit e usa o rótulo explícito', async () => {
    const { interceptor, service } = build('account.view');
    await firstValueFrom(
      interceptor.intercept(
        ctx({
          method: 'GET',
          url: '/admin/accounts/u9',
          params: { id: 'u9' },
          user: ADMIN,
        }),
        handler(of({})),
      ),
    );
    expect(service.registrar).toHaveBeenCalledTimes(1);
    const r = service.registrar.mock.calls[0][0];
    expect(r.action).toBe('account.view');
    expect(r.summary).toBeNull(); // GET não resume body
  });

  it('registra a tentativa mesmo quando o handler falha, com o status do erro', async () => {
    const { interceptor, service } = build();
    const chamada = interceptor.intercept(
      ctx({
        method: 'DELETE',
        url: '/admin/accounts/u9',
        params: { id: 'u9' },
        user: ADMIN,
      }),
      handler(throwError(() => ({ status: 409 }))),
    );
    await expect(firstValueFrom(chamada)).rejects.toEqual({ status: 409 });
    expect(service.registrar).toHaveBeenCalledTimes(1);
    expect(service.registrar.mock.calls[0][0].statusCode).toBe(409);
  });

  it('não grava registro órfão (sem usuário)', async () => {
    const { interceptor, service } = build();
    await firstValueFrom(
      interceptor.intercept(
        ctx({ method: 'POST', url: '/admin/x', user: undefined }),
        handler(of({})),
      ),
    );
    expect(service.registrar).not.toHaveBeenCalled();
  });
});
