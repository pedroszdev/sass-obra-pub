import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Acesso } from '../src/assinaturas/acesso';
import { AssinaturasService } from '../src/assinaturas/assinaturas.service';
import { SubscriptionGuard } from '../src/assinaturas/subscription.guard';

// Paywall (T-130). É o guard que de fato barra alguém — se ele liberar quem não
// pode, o produto vira de graça; se barrar quem pode, o cliente pagante fica
// preso. Os testes travam os dois erros.
function ctx(user: { id: string } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function build(acesso: Acesso) {
  const assinaturas = {
    acessoDe: jest.fn().mockResolvedValue(acesso),
  };
  return {
    guard: new SubscriptionGuard(assinaturas as unknown as AssinaturasService),
    assinaturas,
  };
}

const LIBERADO: Acesso = {
  permitido: true,
  diasRestantesTrial: 5,
  emTrial: true,
};

describe('SubscriptionGuard (T-130)', () => {
  it('deixa passar quem tem acesso (trial válido ou assinatura ativa)', async () => {
    const { guard } = build(LIBERADO);

    await expect(guard.canActivate(ctx({ id: 'u1' }))).resolves.toBe(true);
  });

  it('barra com 402 quem não tem acesso, com o motivo e a rota', async () => {
    const { guard } = build({
      permitido: false,
      motivo: 'trial_expirado',
      diasRestantesTrial: 0,
      emTrial: false,
    });

    try {
      await guard.canActivate(ctx({ id: 'u1' }));
      fail('deveria ter barrado');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      const corpo = err.getResponse() as Record<string, unknown>;
      expect(corpo.motivo).toBe('trial_expirado');
      expect(corpo.redirect).toBe('/assinatura');
    }
  });

  // Sem usuário autenticado o 401 é papel do JwtAuthGuard — este guard não pode
  // transformar "não logado" em "pague". Deixa passar (o outro guard barra).
  it('não é papel dele barrar quem nem está autenticado', async () => {
    const { guard, assinaturas } = build(LIBERADO);

    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true);
    expect(assinaturas.acessoDe).not.toHaveBeenCalled();
  });
});
