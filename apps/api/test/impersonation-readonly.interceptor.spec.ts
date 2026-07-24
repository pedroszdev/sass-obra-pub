import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { ImpersonationReadOnlyInterceptor } from '../src/common/impersonation-readonly.interceptor';

// A garantia da T-187 é que NADA é escrito na conta do cliente durante o "ver
// como". O interceptor é essa garantia: default seguro por inversão (bloqueia
// toda mutação), com uma exceção explícita (@AllowDuringImpersonation) só para
// sair. Os testes travam as duas pontas.

function ctx(
  method: string,
  user: { id: string; impersonatorId?: string } | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function build(liberado: boolean) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(liberado),
  } as unknown as Reflector;
  return new ImpersonationReadOnlyInterceptor(reflector);
}

const handler: CallHandler = { handle: () => of('ok') } as CallHandler;

const ALVO = { id: 'u9', impersonatorId: 'admin1' };
const NORMAL = { id: 'u9' };

describe('ImpersonationReadOnlyInterceptor (T-187)', () => {
  it('deixa GET passar durante a impersonação', async () => {
    const i = build(false);
    await expect(
      firstValueFrom(i.intercept(ctx('GET', ALVO), handler)),
    ).resolves.toBe('ok');
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'bloqueia %s durante a impersonação (403 com code)',
    async (metodo) => {
      const i = build(false);
      try {
        await firstValueFrom(i.intercept(ctx(metodo, ALVO), handler));
        fail('deveria ter bloqueado');
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect(
          (e as ForbiddenException).getResponse() as { code: string },
        ).toMatchObject({ code: 'impersonation_read_only' });
      }
    },
  );

  it('deixa passar a rota @AllowDuringImpersonation (sair/logout)', async () => {
    const i = build(true); // reflector diz que a rota está liberada
    await expect(
      firstValueFrom(i.intercept(ctx('POST', ALVO), handler)),
    ).resolves.toBe('ok');
  });

  it('NÃO afeta uma sessão normal (sem impersonatorId): mutação passa', async () => {
    const i = build(false);
    await expect(
      firstValueFrom(i.intercept(ctx('DELETE', NORMAL), handler)),
    ).resolves.toBe('ok');
  });

  it('não bloqueia requisição sem usuário (rota pública)', async () => {
    const i = build(false);
    await expect(
      firstValueFrom(i.intercept(ctx('POST', undefined), handler)),
    ).resolves.toBe('ok');
  });
});
