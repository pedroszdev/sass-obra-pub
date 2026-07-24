import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminImpersonationService } from '../src/admin/admin-impersonation.service';
import { AuthService } from '../src/auth/auth.service';
import { IMPERSONATION_COOKIE } from '../src/auth/refresh-cookie';
import { User } from '../src/users/user.entity';
import { UserRole } from '../src/users/user-role.enum';

// T-187: abrir o "ver como" grava o cookie de impersonação — mas NUNCA para uma
// conta que não existe nem para outra conta ADMIN (seria escalar, não dar suporte).

function build(alvo: Partial<User> | null) {
  const users = {
    findOne: jest.fn().mockResolvedValue(alvo),
  } as unknown as Repository<User>;
  const auth = {
    issueImpersonationToken: jest.fn().mockResolvedValue('tok.imp.jwt'),
  } as unknown as AuthService;
  const service = new AdminImpersonationService(users, auth);
  return { service, auth };
}

function fakeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

describe('AdminImpersonationService (T-187)', () => {
  it('emite o token do ALVO e grava o cookie de impersonação', async () => {
    const alvo = { id: 'u9', role: UserRole.USER } as User;
    const { service, auth } = build(alvo);
    const res = fakeRes();

    const out = await service.iniciar('u9', 'admin1', res);

    expect(out).toEqual({ ok: true });
    expect(auth.issueImpersonationToken).toHaveBeenCalledWith(alvo, 'admin1');
    expect(res.cookie).toHaveBeenCalledWith(
      IMPERSONATION_COOKIE,
      'tok.imp.jwt',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('404 quando o alvo não existe', async () => {
    const { service, auth } = build(null);
    await expect(
      service.iniciar('sumiu', 'admin1', fakeRes()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auth.issueImpersonationToken).not.toHaveBeenCalled();
  });

  it('recusa impersonar outra conta ADMIN (nunca assumir privilégio)', async () => {
    const { service, auth } = build({
      id: 'a2',
      role: UserRole.ADMIN,
    } as User);
    const res = fakeRes();
    await expect(service.iniciar('a2', 'admin1', res)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auth.issueImpersonationToken).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
