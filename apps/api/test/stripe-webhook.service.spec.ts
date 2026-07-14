import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Repository } from 'typeorm';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';
import { StripeEvent } from '../src/assinaturas/stripe-event.entity';
import { StripeWebhookService } from '../src/assinaturas/stripe-webhook.service';

const T0 = new Date('2026-07-14T12:00:00Z');
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

// Assinatura da Stripe, na forma que importa (o `current_period_end` vive DENTRO
// dos itens na API atual — ler do topo devolveria undefined).
function subStripe(
  over: Partial<{
    status: string;
    fimPeriodo: Date;
    userId: string | null;
    id: string;
  }> = {},
) {
  return {
    id: over.id ?? 'sub_1',
    status: over.status ?? 'active',
    customer: 'cus_1',
    metadata: over.userId === null ? {} : { userId: over.userId ?? 'u1' },
    items: {
      data: [
        {
          current_period_end: unix(
            over.fimPeriodo ?? new Date('2026-08-14T12:00:00Z'),
          ),
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function evento(
  tipo: string,
  sub: Stripe.Subscription,
  criado: Date = T0,
  id = 'evt_1',
): Stripe.Event {
  return {
    id,
    type: tipo,
    created: unix(criado),
    data: { object: sub },
  } as unknown as Stripe.Event;
}

function build(
  over: { assinatura?: Partial<Assinatura> | null; inserido?: boolean } = {},
) {
  const insertExecute = jest.fn().mockResolvedValue({
    raw: over.inserido === false ? [] : [{ id: 'evt_1' }],
  });
  const eventos = {
    createQueryBuilder: jest.fn(() => ({
      insert: () => ({
        values: () => ({ orIgnore: () => ({ execute: insertExecute }) }),
      }),
    })),
    delete: jest.fn(),
  };
  const assinatura =
    over.assinatura === undefined
      ? {
          id: 'a1',
          userId: 'u1',
          status: AssinaturaStatus.TRIALING,
          stripeCustomerId: null,
          stripeAtualizadoEm: null,
          pastDueDesde: null,
        }
      : over.assinatura;
  const assinaturas = {
    findOne: jest.fn().mockResolvedValue(assinatura),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn(() => 'whsec_test'),
  };
  const stripe = {
    webhooks: { constructEvent: jest.fn() },
  };
  const service = new StripeWebhookService(
    stripe as unknown as Stripe,
    assinaturas as unknown as Repository<Assinatura>,
    eventos as unknown as Repository<StripeEvent>,
    config as unknown as ConfigService,
  );
  return { service, assinaturas, eventos, stripe };
}

describe('StripeWebhookService — verificação (T-129)', () => {
  // A assinatura criptográfica é a ÚNICA coisa que separa um evento da Stripe de
  // um POST inventado. Sem ela, qualquer um "confirma" o próprio pagamento.
  it('recusa evento com assinatura inválida', () => {
    const { service, stripe } = build();
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('no signatures found');
    });

    expect(() =>
      service.verificar(Buffer.from('{}'), 'assinatura-forjada'),
    ).toThrow(BadRequestException);
  });

  it('recusa quando não vem assinatura nenhuma', () => {
    const { service } = build();

    expect(() => service.verificar(Buffer.from('{}'), undefined)).toThrow(
      BadRequestException,
    );
  });
});

describe('StripeWebhookService — processamento (T-129)', () => {
  it('assinatura ativa → marca active e grava o fim do período', async () => {
    const { service, assinaturas } = build();

    const r = await service.processar(
      evento('customer.subscription.updated', subStripe()),
      T0,
    );

    expect(r.aplicado).toBe(true);
    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({
        status: AssinaturaStatus.ACTIVE,
        // Lido de DENTRO dos itens — na API atual não existe no topo.
        currentPeriodEnd: new Date('2026-08-14T12:00:00Z'),
        stripeSubscriptionId: 'sub_1',
      }),
    );
  });

  // A Stripe REENTREGA eventos — é comportamento normal dela, não exceção.
  it('evento repetido não é aplicado duas vezes', async () => {
    const { service, assinaturas } = build({ inserido: false });

    const r = await service.processar(
      evento('customer.subscription.updated', subStripe()),
      T0,
    );

    expect(r.aplicado).toBe(false);
    expect(r.motivo).toContain('repetido');
    expect(assinaturas.update).not.toHaveBeenCalled();
  });

  // Eventos chegam FORA DE ORDEM: um `updated` atrasado não pode ressuscitar um
  // estado vencido por cima de um mais novo.
  it('evento mais velho que o estado atual é ignorado', async () => {
    const { service, assinaturas } = build({
      assinatura: {
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.ACTIVE,
        stripeAtualizadoEm: new Date('2026-07-14T12:00:00Z'),
      },
    });

    const r = await service.processar(
      evento(
        'customer.subscription.updated',
        subStripe({ status: 'canceled' }),
        new Date('2026-07-14T10:00:00Z'), // 2h ANTES do último aplicado
      ),
      T0,
    );

    expect(r.aplicado).toBe(false);
    expect(assinaturas.update).not.toHaveBeenCalled();
  });

  it('past_due carimba desde quando o pagamento falha', async () => {
    const { service, assinaturas } = build();

    await service.processar(
      evento(
        'customer.subscription.updated',
        subStripe({ status: 'past_due' }),
      ),
      T0,
    );

    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({
        status: AssinaturaStatus.PAST_DUE,
        pastDueDesde: T0,
      }),
    );
  });

  // Cada retentativa da Stripe reiniciaria a carência — e o inadimplente nunca
  // seria bloqueado. O início do past_due é o da PRIMEIRA falha.
  it('past_due repetido NÃO reinicia a carência', async () => {
    const inicio = new Date('2026-07-10T12:00:00Z');
    const { service, assinaturas } = build({
      assinatura: {
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.PAST_DUE,
        pastDueDesde: inicio,
        stripeAtualizadoEm: null,
      },
    });

    await service.processar(
      evento(
        'customer.subscription.updated',
        subStripe({ status: 'past_due' }),
      ),
      T0,
    );

    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({ pastDueDesde: inicio }),
    );
  });

  // `incomplete` = a 1ª cobrança ainda não foi paga. Derrubar o usuário aqui
  // puniria quem está no meio do trial e apenas começou a digitar o cartão.
  it('incomplete NÃO mexe no estado local (o trial segue valendo)', async () => {
    const { service, assinaturas } = build();

    const r = await service.processar(
      evento(
        'customer.subscription.updated',
        subStripe({ status: 'incomplete' }),
      ),
      T0,
    );

    expect(r.aplicado).toBe(false);
    expect(assinaturas.update).not.toHaveBeenCalled();
  });

  it('cancelada → status canceled (o acesso ainda vale até o fim do período)', async () => {
    const { service, assinaturas } = build();

    await service.processar(
      evento(
        'customer.subscription.deleted',
        subStripe({ status: 'canceled' }),
      ),
      T0,
    );

    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({
        status: AssinaturaStatus.CANCELED,
        currentPeriodEnd: new Date('2026-08-14T12:00:00Z'),
      }),
    );
  });

  // Falha ao aplicar: o registro do evento é REMOVIDO para que a reentrega da
  // Stripe possa tentar de novo — senão um pagamento se perderia para sempre.
  it('falha ao aplicar libera o evento para reentrega', async () => {
    const { service, assinaturas, eventos } = build();
    assinaturas.update.mockRejectedValue(new Error('banco caiu'));

    await expect(
      service.processar(
        evento('customer.subscription.updated', subStripe()),
        T0,
      ),
    ).rejects.toThrow('banco caiu');
    expect(eventos.delete).toHaveBeenCalledWith({ id: 'evt_1' });
  });
});
