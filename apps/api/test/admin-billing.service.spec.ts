import { Repository } from 'typeorm';
import { AdminBillingService } from '../src/admin/admin-billing.service';
import { AsaasBillingService } from '../src/assinaturas/asaas-billing.service';
import { AsaasEvent } from '../src/assinaturas/asaas-event.entity';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { StripeBillingService } from '../src/assinaturas/stripe-billing.service';
import { StripeEvent } from '../src/assinaturas/stripe-event.entity';
import { User } from '../src/users/user.entity';

// Espelho de assinaturas + webhooks (T-192, ampliado pela T-221).
//
// 🔴 O que a T-221 mudou e por quê: o MRR multiplicava a base INTEIRA pelo preço
// da Stripe. Os dois provedores têm fontes de preço diferentes — Stripe no
// catálogo dela, Asaas no nosso config store (T-213) — então, no período de
// coexistência, metade do número saía errada. E a Stripe fora do ar zerava o MRR
// inclusive do Asaas, que não depende dela.

const PRECOS_STRIPE = {
  mensal: { valor: 9900, moeda: 'brl' },
  anual: { valor: 99000, moeda: 'brl' },
};
const PRECOS_ASAAS = {
  mensal: { valor: 24900, moeda: 'brl' },
  anual: { valor: 249000, moeda: 'brl' },
};

function build(
  opts: {
    ativos?: { provider: string | null; plano: string }[];
    stripeThrow?: boolean;
    asaasThrow?: boolean;
  } = {},
) {
  const assinaturas = {
    find: jest.fn().mockResolvedValue(opts.ativos ?? []),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as Repository<Assinatura>;
  const users = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as Repository<User>;
  const eventos = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as Repository<StripeEvent>;
  const eventosAsaas = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as Repository<AsaasEvent>;
  const billing = {
    listarPrecos: opts.stripeThrow
      ? jest.fn().mockRejectedValue(new Error('stripe fora'))
      : jest.fn().mockResolvedValue(PRECOS_STRIPE),
  } as unknown as StripeBillingService;
  const asaas = {
    listarPrecos: opts.asaasThrow
      ? jest.fn().mockRejectedValue(new Error('sem preço configurado'))
      : jest.fn().mockResolvedValue(PRECOS_ASAAS),
    detalhesPortal: jest.fn().mockResolvedValue({ cobrancas: [] }),
  } as unknown as AsaasBillingService;
  return {
    service: new AdminBillingService(
      assinaturas,
      users,
      eventos,
      eventosAsaas,
      billing,
      asaas,
    ),
    eventos,
    eventosAsaas,
    assinaturas,
  };
}

describe('AdminBillingService.mrr', () => {
  it('soma mensais × preço + anuais × preço/12 (centavos)', async () => {
    const { service } = build({
      ativos: [
        { provider: 'stripe', plano: 'mensal' },
        { provider: 'stripe', plano: 'mensal' },
        { provider: 'stripe', plano: 'mensal' },
        { provider: 'stripe', plano: 'anual' },
        { provider: 'stripe', plano: 'anual' },
      ],
    });
    const mrr = await service.mrr();
    // 3×9900 + 2×round(99000/12)=2×8250=16500 → 29700 + 16500 = 46200
    expect(mrr?.mrrCentavos).toBe(46200);
    expect(mrr?.ativosMensal).toBe(3);
    expect(mrr?.ativosAnual).toBe(2);
    expect(mrr?.parcial).toBe(false);
  });

  it('cada provedor usa o PREÇO DELE', async () => {
    // Antes, os dois eram multiplicados pelo preço da Stripe.
    const { service } = build({
      ativos: [
        { provider: 'stripe', plano: 'mensal' },
        { provider: 'asaas', plano: 'mensal' },
      ],
    });
    const mrr = await service.mrr();
    expect(mrr?.mrrCentavos).toBe(9900 + 24900);
    expect(mrr?.porProvider).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'stripe', mrrCentavos: 9900 }),
        expect.objectContaining({ provider: 'asaas', mrrCentavos: 24900 }),
      ]),
    );
  });

  // 🔴 O medo registrado no backlog. A defesa é contar ASSINATURA, não id de
  // provedor: uma conta migrada tem o id da Stripe guardado como HISTÓRICO e o
  // do Asaas ativo, e quem responde "quem cobra" é o `provider`.
  it('conta migrada NÃO conta em dobro', async () => {
    const { service } = build({
      ativos: [{ provider: 'asaas', plano: 'mensal' }],
    });
    const mrr = await service.mrr();
    expect(mrr?.ativosMensal).toBe(1);
    expect(mrr?.mrrCentavos).toBe(24900);
    expect(mrr?.porProvider).toHaveLength(1);
  });

  // A migration da T-211 preencheu 'stripe' em toda assinatura que já existia,
  // então nulo COM status ativo é remanescente daquela época — não conta nova
  // (conta nova em trial não é ativa e não chega aqui).
  it('provider nulo conta como stripe', async () => {
    const { service } = build({
      ativos: [{ provider: null, plano: 'mensal' }],
    });
    const mrr = await service.mrr();
    expect(mrr?.porProvider).toEqual([
      expect.objectContaining({ provider: 'stripe', mrrCentavos: 9900 }),
    ]);
  });

  describe('degradação', () => {
    // Antes, a Stripe fora zerava o MRR inteiro — inclusive o do Asaas.
    it('provedor fora sai da conta, e a resposta avisa que é parcial', async () => {
      const { service } = build({
        ativos: [
          { provider: 'stripe', plano: 'mensal' },
          { provider: 'asaas', plano: 'mensal' },
        ],
        stripeThrow: true,
      });
      const mrr = await service.mrr();
      expect(mrr?.mrrCentavos).toBe(24900); // só o Asaas
      expect(mrr?.parcial).toBe(true);
      expect(mrr?.porProvider).toHaveLength(1);
    });

    it('nenhum provedor respondeu → null, como antes', async () => {
      const { service } = build({
        ativos: [{ provider: 'stripe', plano: 'mensal' }],
        stripeThrow: true,
      });
      expect(await service.mrr()).toBeNull();
    });

    it('sem assinante ativo → zero, não null', async () => {
      // Zero é um fato; null é "não sei". A tela mostra coisas diferentes.
      const mrr = await build({ ativos: [] }).service.mrr();
      expect(mrr?.mrrCentavos).toBe(0);
      expect(mrr?.parcial).toBe(false);
    });
  });
});

describe('AdminBillingService.webhooks', () => {
  // Antes lia só `stripe_events` — um evento do Asaas era invisível. Importa
  // porque a fila do Asaas PARA sozinha após falhas seguidas (T-209).
  it('junta os dois provedores, marcando a origem, mais recente primeiro', async () => {
    const { service, eventos, eventosAsaas } = build();
    (eventos.findAndCount as jest.Mock).mockResolvedValue([
      [
        {
          id: 'evt_s',
          tipo: 'invoice.paid',
          criadoEmStripe: new Date('2026-08-01T10:00:00Z'),
          processadoEm: new Date('2026-08-01T10:00:01Z'),
        },
      ],
      1,
    ]);
    (eventosAsaas.findAndCount as jest.Mock).mockResolvedValue([
      [
        {
          id: 'evt_a',
          tipo: 'PAYMENT_CONFIRMED',
          criadoEmAsaas: null, // o Asaas não carimba todo evento (T-211)
          processadoEm: new Date('2026-08-02T10:00:00Z'),
        },
      ],
      1,
    ]);

    const p = await service.webhooks(1);
    expect(p.total).toBe(2);
    expect(p.data.map((e) => e.origem)).toEqual(['asaas', 'stripe']);
    expect(p.data[0].criadoEmProvedor).toBeNull();
  });
});

describe('AdminBillingService.cobrancasDaConta', () => {
  // Substitui o "reenviar cobrança" que o backlog pedia — não existe reenvio no
  // Asaas; o que resolve é o link da cobrança em aberto.
  it('conta do Asaas devolve as cobranças do portal', async () => {
    const { service, assinaturas } = build();
    (assinaturas.findOne as jest.Mock).mockResolvedValue({
      userId: 'u1',
      provider: 'asaas',
    });
    expect(await service.cobrancasDaConta('u1')).toEqual([]);
  });

  it('conta da Stripe devolve vazio — as faturas ficam no painel dela', async () => {
    const { service, assinaturas } = build();
    (assinaturas.findOne as jest.Mock).mockResolvedValue({
      userId: 'u1',
      provider: 'stripe',
    });
    expect(await service.cobrancasDaConta('u1')).toEqual([]);
  });
});
