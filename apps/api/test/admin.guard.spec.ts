import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { AdminGuard } from '../src/admin/admin.guard';
import { UserRole } from '../src/users/user-role.enum';

// Trava do backoffice (T-180). Se ela liberar um não-admin, a área mais sensível
// do sistema vira pública; se responder 403 em vez de 404, confirma a existência
// da área a quem não devia saber (mesmo espírito da enumeração T-175). Os testes
// travam os dois erros.
function ctx(
  user: { id: string; role: UserRole } | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard (T-180)', () => {
  const guard = new AdminGuard();

  it('deixa passar a role ADMIN', () => {
    expect(guard.canActivate(ctx({ id: 'a1', role: UserRole.ADMIN }))).toBe(
      true,
    );
  });

  it('bloqueia usuário comum com 404 (nunca 403)', () => {
    expect(() =>
      guard.canActivate(ctx({ id: 'u1', role: UserRole.USER })),
    ).toThrow(NotFoundException);
  });

  it('bloqueia requisição sem usuário com 404 (defesa em profundidade)', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(NotFoundException);
  });
});
