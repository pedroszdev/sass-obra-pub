import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminStepUpGuard } from '../src/admin/admin-stepup.guard';
import { User } from '../src/users/user.entity';

// Guard de step-up (T-183): libera só com a janela válida; senão 428 com o code
// que o front reconhece para pedir a senha.
function ctx(user: { id: string } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function build(ate: Date | null) {
  const users = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        ate
          ? { id: 'a1', adminStepupAte: ate }
          : { id: 'a1', adminStepupAte: null },
      ),
  } as unknown as Repository<User>;
  return new AdminStepUpGuard(users);
}

describe('AdminStepUpGuard (T-183)', () => {
  it('libera com a janela válida (futuro)', async () => {
    const guard = build(new Date(Date.now() + 60_000));
    await expect(guard.canActivate(ctx({ id: 'a1' }))).resolves.toBe(true);
  });

  it('428 step_up_required quando a janela venceu', async () => {
    const guard = build(new Date(Date.now() - 60_000));
    try {
      await guard.canActivate(ctx({ id: 'a1' }));
      fail('deveria ter barrado');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.PRECONDITION_REQUIRED);
      expect((err.getResponse() as { code: string }).code).toBe(
        'step_up_required',
      );
    }
  });

  it('428 quando nunca reconfirmou (null)', async () => {
    const guard = build(null);
    await expect(guard.canActivate(ctx({ id: 'a1' }))).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
