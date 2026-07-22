import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminGuard } from '../src/admin/admin.guard';
import { User } from '../src/users/user.entity';
import { UserRole } from '../src/users/user-role.enum';

// Trava do backoffice (T-180). Valida a role NO BANCO (T-183): promover/remover
// admin vale na hora. Se ela liberar um não-admin, a área mais sensível vira
// pública; se responder 403 em vez de 404, confirma a existência da área.
function ctx(user: { id: string } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function build(role: UserRole | null) {
  const users = {
    findOne: jest.fn().mockResolvedValue(role ? { id: 'u1', role } : null),
  } as unknown as Repository<User>;
  return { guard: new AdminGuard(users), users };
}

describe('AdminGuard (T-180/T-183)', () => {
  it('deixa passar quando o BANCO diz ADMIN', async () => {
    const { guard } = build(UserRole.ADMIN);
    await expect(guard.canActivate(ctx({ id: 'u1' }))).resolves.toBe(true);
  });

  it('bloqueia (404) quando o banco diz USER — mesmo com token de admin', async () => {
    const { guard } = build(UserRole.USER);
    await expect(guard.canActivate(ctx({ id: 'u1' }))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('bloqueia (404) quando o usuário não existe mais', async () => {
    const { guard } = build(null);
    await expect(guard.canActivate(ctx({ id: 'u1' }))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('bloqueia (404) sem usuário na request (defesa em profundidade)', async () => {
    const { guard } = build(UserRole.ADMIN);
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
