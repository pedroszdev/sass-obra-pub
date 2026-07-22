import { Repository } from 'typeorm';
import { AdminBillingService } from '../src/admin/admin-billing.service';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { StripeBillingService } from '../src/assinaturas/stripe-billing.service';
import { StripeEvent } from '../src/assinaturas/stripe-event.entity';
import { User } from '../src/users/user.entity';

// Espelho de assinaturas + webhooks (T-192). O que importa: o MRR simples
// (mensais × preço + anuais × preço/12) e o best-effort quando a Stripe cai.

function build(opts: {
  ativosMensal?: number;
  ativosAnual?: number;
  precos?: unknown;
  precosThrow?: boolean;
}) {
  const assinaturas = {
    count: jest
      .fn()
      .mockResolvedValueOnce(opts.ativosMensal ?? 0)
      .mockResolvedValueOnce(opts.ativosAnual ?? 0),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as Repository<Assinatura>;
  const users = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as Repository<User>;
  const eventos = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as Repository<StripeEvent>;
  const billing = {
    listarPrecos: opts.precosThrow
      ? jest.fn().mockRejectedValue(new Error('stripe fora'))
      : jest.fn().mockResolvedValue(opts.precos),
  } as unknown as StripeBillingService;
  return {
    service: new AdminBillingService(assinaturas, users, eventos, billing),
  };
}

describe('AdminBillingService.mrr (T-192)', () => {
  it('soma mensais × preço + anuais × preço/12 (centavos)', async () => {
    const { service } = build({
      ativosMensal: 3,
      ativosAnual: 2,
      precos: {
        mensal: { valor: 9900, moeda: 'brl' }, // R$99
        anual: { valor: 99000, moeda: 'brl' }, // R$990/ano → 8250/mês
      },
    });
    const mrr = await service.mrr();
    // 3×9900 + 2×round(99000/12)=2×8250=16500 → 29700 + 16500 = 46200
    expect(mrr).toEqual({
      mrrCentavos: 46200,
      moeda: 'brl',
      ativosMensal: 3,
      ativosAnual: 2,
    });
  });

  it('MRR null quando a Stripe/preço está fora (best-effort)', async () => {
    const { service } = build({ ativosMensal: 5, precosThrow: true });
    expect(await service.mrr()).toBeNull();
  });
});
