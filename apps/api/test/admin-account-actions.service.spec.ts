import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminAccountActionsService } from '../src/admin/admin-account-actions.service';
import { AuthService } from '../src/auth/auth.service';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { User } from '../src/users/user.entity';

// Ações de conta do admin (T-185). São mutações sensíveis (bypass de paywall,
// revogar sessões) — os testes travam o comportamento de cada uma.

const NOW = new Date('2026-07-14T12:00:00Z');
const dias = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function build(assinatura: Partial<Assinatura> | null) {
  const saved: Partial<Assinatura>[] = [];
  const assinaturas = {
    findOne: jest.fn().mockResolvedValue(assinatura),
    save: jest.fn((a: Partial<Assinatura>) => {
      saved.push({ ...a });
      return Promise.resolve(a);
    }),
  } as unknown as Repository<Assinatura>;
  const refreshTokens = {
    update: jest.fn().mockResolvedValue({ affected: 2 }),
  } as unknown as Repository<RefreshToken>;
  const users = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findOne: jest.fn().mockResolvedValue({ id: 'u1' }),
  } as unknown as Repository<User>;
  const auth = {
    resendVerification: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
  const service = new AdminAccountActionsService(
    assinaturas,
    refreshTokens,
    users,
    auth,
  );
  return { service, assinaturas, refreshTokens, users, auth, saved };
}

describe('AdminAccountActionsService.estenderTrial (T-185)', () => {
  it('soma dias a partir do fim atual quando o trial ainda corre', async () => {
    const { service, saved } = build({
      status: AssinaturaStatus.TRIALING,
      trialEndsAt: dias(2),
    });
    await service.estenderTrial('u1', 5, NOW);
    expect(saved[0].trialEndsAt).toEqual(dias(7)); // 2 + 5
  });

  it('soma a partir de agora quando o trial já expirou', async () => {
    const { service, saved } = build({
      status: AssinaturaStatus.TRIALING,
      trialEndsAt: dias(-3),
    });
    await service.estenderTrial('u1', 5, NOW);
    expect(saved[0].trialEndsAt).toEqual(dias(5)); // now + 5
  });

  it('recusa estender trial de conta que não está em teste', async () => {
    const { service } = build({ status: AssinaturaStatus.CANCELED });
    await expect(service.estenderTrial('u1', 5, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AdminAccountActionsService cortesia/suspensão (T-185)', () => {
  it('concede cortesia por N dias a partir de agora', async () => {
    const { service, saved } = build({ status: AssinaturaStatus.CANCELED });
    await service.concederCortesia('u1', 10, NOW);
    expect(saved[0].cortesiaAte).toEqual(dias(10));
  });

  it('revoga a cortesia (null)', async () => {
    const { service, saved } = build({ cortesiaAte: dias(10) });
    await service.revogarCortesia('u1');
    expect(saved[0].cortesiaAte).toBeNull();
  });

  it('suspende gravando o instante; idempotente se já suspensa', async () => {
    const { service, saved } = build({ suspensoEm: null });
    await service.suspender('u1', NOW);
    expect(saved[0].suspensoEm).toEqual(NOW);

    const jaSuspensa = build({ suspensoEm: dias(-2) });
    await jaSuspensa.service.suspender('u1', NOW);
    expect(jaSuspensa.saved).toHaveLength(0); // não regravou
  });

  it('reativa zerando a suspensão', async () => {
    const { service, saved } = build({ suspensoEm: dias(-2) });
    await service.reativar('u1');
    expect(saved[0].suspensoEm).toBeNull();
  });

  it('404 quando a conta não tem assinatura', async () => {
    const { service } = build(null);
    await expect(service.concederCortesia('u1', 5, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AdminAccountActionsService reenviar/revogar (T-185)', () => {
  it('reenvia verificação pelo fluxo do auth', async () => {
    const { service, auth } = build(null);
    await service.reenviarVerificacao('u1');
    expect(auth.resendVerification).toHaveBeenCalledWith('u1');
  });

  it('revoga todas as sessões (revoked=true por userId)', async () => {
    const { service, refreshTokens } = build(null);
    await service.revogarSessoes('u1');
    expect(refreshTokens.update).toHaveBeenCalledWith(
      { userId: 'u1' },
      { revoked: true },
    );
  });

  it('verificarEmail marca email_verified_at quando ainda nulo', async () => {
    const { service, users } = build(null);
    await expect(service.verificarEmail('u1')).resolves.toBeUndefined();
    const [, patch] = (users.update as jest.Mock).mock.calls[0] as [
      unknown,
      { emailVerifiedAt: Date },
    ];
    expect(patch.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('verificarEmail: nada afetado e conta inexistente → 404', async () => {
    const { service, users } = build(null);
    (users.update as jest.Mock).mockResolvedValue({ affected: 0 });
    (users.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.verificarEmail('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
