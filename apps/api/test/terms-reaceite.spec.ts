import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { GoogleVerifierService } from '../src/auth/google/google-verifier.service';
import { precisaReaceitarTermos } from '../src/users/user-response';
import { User } from '../src/users/user.entity';
import { UsersService } from '../src/users/users.service';

// Re-aceite dos termos (T-196). Duas garantias: a DECISÃO (função pura) — só força
// quando há versão vigente diferente da aceita; e o REGISTRO — aceitar carimba a
// versão vigente + o instante.

describe('precisaReaceitarTermos (T-196)', () => {
  it('sem versão vigente → nunca força (versionamento desligado)', () => {
    expect(precisaReaceitarTermos(null, null)).toBe(false);
    expect(precisaReaceitarTermos('1.0', null)).toBe(false);
  });

  it('versão aceita igual à vigente → false', () => {
    expect(precisaReaceitarTermos('2026-07-27', '2026-07-27')).toBe(false);
  });

  it('versão aceita diferente (ou nula) da vigente → true', () => {
    expect(precisaReaceitarTermos('1.0', '2.0')).toBe(true);
    expect(precisaReaceitarTermos(null, '1.0')).toBe(true);
  });
});

describe('UsersService.aceitarTermos (T-196)', () => {
  function build(user: User | null) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn((u: User) => Promise.resolve(u)),
    } as unknown as Repository<User>;
    // Só o repo de users importa aqui; os demais nunca são tocados por aceitarTermos.
    const service = new UsersService(
      repo,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as unknown as GoogleVerifierService,
    );
    return { service, repo };
  }

  it('carimba a versão vigente e o instante', async () => {
    const user = { id: 'u1', termsVersion: '1.0' } as User;
    const { service, repo } = build(user);
    const now = new Date('2026-07-27T10:00:00Z');
    const salvo = await service.aceitarTermos('u1', '2.0', now);
    expect(salvo.termsVersion).toBe('2.0');
    expect(salvo.termsAcceptedAt).toBe(now);
    expect(repo.save).toHaveBeenCalled();
  });

  it('404 quando a conta não existe', async () => {
    const { service } = build(null);
    await expect(service.aceitarTermos('x', '1.0')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
