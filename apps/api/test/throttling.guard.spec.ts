import { createHash } from 'node:crypto';
import { EmailThrottlerGuard } from '../src/common/throttling/email-throttler.guard';
import { UserThrottlerGuard } from '../src/common/throttling/user-throttler.guard';

// getTracker é protected e não usa `this` — instanciamos pelo prototype e
// expomos a assinatura para chamar direto (sem montar options/storage/reflector).
type TrackFn = (req: Record<string, unknown>) => Promise<string>;
const emailTracker = Object.create(EmailThrottlerGuard.prototype) as {
  getTracker: TrackFn;
};
const userTracker = Object.create(UserThrottlerGuard.prototype) as {
  getTracker: TrackFn;
};

const hashEmail = (email: string) =>
  createHash('sha256').update(email).digest('hex');

describe('EmailThrottlerGuard.getTracker (T-104)', () => {
  it('chaveia pelo hash do email normalizado (trim + lowercase)', async () => {
    const tracker = await emailTracker.getTracker({
      body: { email: '  Fulano@Empresa.COM ' },
      ip: '1.2.3.4',
    });
    expect(tracker).toBe(`email:${hashEmail('fulano@empresa.com')}`);
  });

  it('mesmo email em caixas diferentes cai no MESMO balde', async () => {
    const a = await emailTracker.getTracker({ body: { email: 'A@x.com' } });
    const b = await emailTracker.getTracker({ body: { email: 'a@X.com' } });
    expect(a).toBe(b);
  });

  it('sem email no corpo, cai no IP (ainda conta a tentativa)', async () => {
    const tracker = await emailTracker.getTracker({ body: {}, ip: '9.9.9.9' });
    expect(tracker).toBe('ip:9.9.9.9');
  });

  it('respeita o proxy: usa o 1º de req.ips quando presente', async () => {
    const tracker = await emailTracker.getTracker({
      body: undefined,
      ips: ['200.1.1.1', '10.0.0.1'],
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('ip:200.1.1.1');
  });
});

describe('UserThrottlerGuard.getTracker (T-104)', () => {
  it('chaveia pelo id do usuário autenticado', async () => {
    const tracker = await userTracker.getTracker({
      user: { id: 'user-42' },
      ip: '1.2.3.4',
    });
    expect(tracker).toBe('user:user-42');
  });

  it('sem usuário (ex.: rota por token), cai no IP', async () => {
    const tracker = await userTracker.getTracker({ ip: '7.7.7.7' });
    expect(tracker).toBe('ip:7.7.7.7');
  });
});
