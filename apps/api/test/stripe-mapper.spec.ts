import Stripe from 'stripe';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';
import {
  agendadaParaCancelar,
  estadoDaAssinatura,
  extrairPlano,
  montarPatch,
} from '../src/assinaturas/stripe-mapper';

const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const FIM = new Date('2026-08-15T17:17:11.000Z');

// Assinatura da Stripe na forma que importa: `current_period_end` vive nos itens,
// e o cancelamento agendado pode vir por `cancel_at_period_end` (legado) OU por
// `cancel_at` (o que o Portal usa nas versões novas da API).
function sub(
  over: Partial<{
    status: string;
    cancelAtPeriodEnd: boolean;
    cancelAt: number | null;
    interval: string | null;
    intervalCount: number;
  }> = {},
): Stripe.Subscription {
  const recurring =
    over.interval === null
      ? undefined
      : {
          interval: over.interval ?? 'month',
          interval_count: over.intervalCount ?? 1,
        };
  return {
    id: 'sub_1',
    status: over.status ?? 'active',
    cancel_at_period_end: over.cancelAtPeriodEnd ?? false,
    cancel_at: over.cancelAt ?? null,
    customer: 'cus_1',
    metadata: { userId: 'u1' },
    items: {
      data: [{ current_period_end: unix(FIM), price: { recurring } }],
    },
  } as unknown as Stripe.Subscription;
}

describe('stripe-mapper — cancelamento agendado (T-144)', () => {
  describe('agendadaParaCancelar', () => {
    it('detecta o booleano legado cancel_at_period_end', () => {
      expect(agendadaParaCancelar(sub({ cancelAtPeriodEnd: true }))).toBe(true);
    });

    // O caso que quebrava em prod: Portal na API nova agenda por `cancel_at` e
    // deixa `cancel_at_period_end = false`. Sem ler `cancel_at`, o cancelamento
    // passava batido e a tela dizia "renova em X" a quem já cancelou.
    it('detecta o agendamento por cancel_at (Portal, API nova)', () => {
      expect(
        agendadaParaCancelar(
          sub({ cancelAtPeriodEnd: false, cancelAt: unix(FIM) }),
        ),
      ).toBe(true);
    });

    it('assinatura que renova normalmente → false', () => {
      expect(agendadaParaCancelar(sub())).toBe(false);
    });
  });

  it('estadoDaAssinatura reflete o cancelamento vindo por cancel_at', () => {
    const estado = estadoDaAssinatura(sub({ cancelAt: unix(FIM) }));
    expect(estado).not.toBeNull();
    expect(estado?.status).toBe(AssinaturaStatus.ACTIVE);
    expect(estado?.cancelAtPeriodEnd).toBe(true);
    expect(estado?.currentPeriodEnd).toEqual(FIM);
  });
});

describe('stripe-mapper — plano contratado (T-131)', () => {
  it('lê o plano do INTERVALO da recorrência', () => {
    expect(extrairPlano(sub({ interval: 'month' }))).toBe('mensal');
    expect(extrairPlano(sub({ interval: 'year' }))).toBe('anual');
  });

  it('recorrência desconhecida → null (não chuta um plano)', () => {
    expect(extrairPlano(sub({ interval: null }))).toBeNull();
    expect(
      extrairPlano(sub({ interval: 'month', intervalCount: 3 })),
    ).toBeNull();
  });

  it('estadoDaAssinatura carrega o plano', () => {
    expect(estadoDaAssinatura(sub({ interval: 'year' }))?.plano).toBe('anual');
  });

  describe('montarPatch', () => {
    const atual = {
      pastDueDesde: null,
      stripeCustomerId: 'cus_1',
      plano: 'mensal' as const,
    };

    it('grava o plano novo quando a Stripe o informa', () => {
      const estado = estadoDaAssinatura(sub({ interval: 'year' }))!;
      expect(montarPatch(atual, estado, 'cus_1').plano).toBe('anual');
    });

    // Sobrescrever com um chute faria a tela anunciar o plano errado a quem paga.
    it('PRESERVA o plano local quando a recorrência é desconhecida', () => {
      const estado = estadoDaAssinatura(sub({ interval: null }))!;
      expect(estado.plano).toBeNull();
      expect(montarPatch(atual, estado, 'cus_1').plano).toBe('mensal');
    });
  });
});
