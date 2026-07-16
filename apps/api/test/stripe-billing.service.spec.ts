import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Repository } from 'typeorm';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';
import { StripeBillingService } from '../src/assinaturas/stripe-billing.service';
import { User } from '../src/users/user.entity';

const ENV: Record<string, string> = {
  STRIPE_PRICE_ID: 'price_123',
  STRIPE_PRICE_ID_ANUAL: 'price_anual_456',
  WEB_ORIGIN: 'https://app.prumolicita.com.br',
};

function build(
  over: {
    stripe?: unknown;
    assinatura?: Partial<Assinatura> | null;
    env?: Record<string, string>;
  } = {},
) {
  const checkoutCreate = jest
    .fn()
    .mockResolvedValue({ url: 'https://checkout.stripe.com/s/1' });
  const customersCreate = jest.fn().mockResolvedValue({ id: 'cus_1' });
  const portalCreate = jest
    .fn()
    .mockResolvedValue({ url: 'https://billing.stripe.com/p/1' });

  const stripe =
    over.stripe === undefined
      ? {
          checkout: { sessions: { create: checkoutCreate } },
          customers: { create: customersCreate },
          billingPortal: { sessions: { create: portalCreate } },
        }
      : over.stripe;

  const assinatura =
    over.assinatura === undefined
      ? {
          id: 'a1',
          userId: 'u1',
          status: AssinaturaStatus.TRIALING,
          stripeCustomerId: null,
        }
      : over.assinatura;

  const assinaturas = {
    findOne: jest.fn().mockResolvedValue(assinatura),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const users = {
    findOne: jest
      .fn()
      .mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'Fulano' }),
  };
  const config = {
    get: jest.fn((k: string) => (over.env ?? ENV)[k]),
  };

  const service = new StripeBillingService(
    stripe as unknown as Stripe | null,
    assinaturas as unknown as Repository<Assinatura>,
    users as unknown as Repository<User>,
    config as unknown as ConfigService,
  );
  return {
    service,
    checkoutCreate,
    customersCreate,
    portalCreate,
    assinaturas,
  };
}

describe('StripeBillingService (T-128)', () => {
  it('abre o Checkout em modo assinatura e devolve a URL', async () => {
    const { service, checkoutCreate } = build();

    await expect(service.criarCheckout('u1', 'mensal')).resolves.toEqual({
      url: 'https://checkout.stripe.com/s/1',
    });

    const params = checkoutCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params.mode).toBe('subscription');
    expect(params.line_items).toEqual([{ price: 'price_123', quantity: 1 }]);
  });

  // A Stripe é explícita: passar payment_method_types desliga os métodos
  // dinâmicos e derruba a conversão. Quem escolhe os meios é o Dashboard.
  it('NUNCA manda payment_method_types', async () => {
    const { service, checkoutCreate } = build();

    await service.criarCheckout('u1', 'mensal');

    const params = checkoutCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('payment_method_types');
  });

  // O trial já foi consumido no nosso lado (T-127): repeti-lo aqui daria 7 dias
  // de graça a MAIS para quem já os teve. E o Stripe Tax não cobre o Brasil.
  it('não repete o trial nem liga o automatic_tax', async () => {
    const { service, checkoutCreate } = build();

    await service.criarCheckout('u1', 'mensal');

    const params = checkoutCreate.mock.calls[0][0] as {
      subscription_data?: Record<string, unknown>;
    };
    expect(params.subscription_data).not.toHaveProperty('trial_period_days');
    expect(params).not.toHaveProperty('automatic_tax');
  });

  // Sem isto o webhook (T-129) teria de adivinhar o dono do pagamento pelo
  // e-mail — que a pessoa pode trocar dentro do próprio Checkout.
  it('carimba o userId na sessão e na assinatura', async () => {
    const { service, checkoutCreate } = build();

    await service.criarCheckout('u1', 'mensal');

    const params = checkoutCreate.mock.calls[0][0] as {
      client_reference_id: string;
      subscription_data: { metadata: { userId: string } };
    };
    expect(params.client_reference_id).toBe('u1');
    expect(params.subscription_data.metadata.userId).toBe('u1');
  });

  it('manda chave de idempotência (retry não pode virar 2 cobranças)', async () => {
    const { service, checkoutCreate } = build();

    await service.criarCheckout('u1', 'mensal');

    const opts = checkoutCreate.mock.calls[0][1] as { idempotencyKey: string };
    expect(opts.idempotencyKey).toContain('u1');
  });

  it('cobra o price do plano escolhido (T-131)', async () => {
    const { service, checkoutCreate } = build();

    await service.criarCheckout('u1', 'anual');

    const params = checkoutCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params.line_items).toEqual([
      { price: 'price_anual_456', quantity: 1 },
    ]);
  });

  // O bug que a chave SEM o plano causaria: a Stripe devolve a resposta original
  // para uma chave já usada, então quem abrisse o mensal, voltasse e escolhesse o
  // anual receberia a sessão do MENSAL — e pagaria o plano que não escolheu.
  it('chaves de idempotência DIFERENTES por plano', async () => {
    const { service, checkoutCreate } = build();

    await service.criarCheckout('u1', 'mensal');
    await service.criarCheckout('u1', 'anual');

    const primeira = (
      checkoutCreate.mock.calls[0][1] as { idempotencyKey: string }
    ).idempotencyKey;
    const segunda = (
      checkoutCreate.mock.calls[1][1] as { idempotencyKey: string }
    ).idempotencyKey;
    expect(primeira).not.toBe(segunda);
  });

  it('503 quando falta o price do anual', async () => {
    const { service } = build({
      env: { STRIPE_PRICE_ID: 'price_123', WEB_ORIGIN: 'https://x' },
    });

    await expect(service.criarCheckout('u1', 'anual')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  // Um Customer por usuário: sem isto, cada tentativa de pagar criaria um cliente
  // novo na Stripe e o histórico ficaria espalhado por vários.
  it('cria o Customer na 1ª vez e o GRAVA na assinatura', async () => {
    const { service, customersCreate, assinaturas } = build();

    await service.criarCheckout('u1', 'mensal');

    expect(customersCreate).toHaveBeenCalledTimes(1);
    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      { stripeCustomerId: 'cus_1' },
    );
  });

  it('reusa o Customer já gravado (não cria outro)', async () => {
    const { service, customersCreate, checkoutCreate } = build({
      assinatura: { id: 'a1', userId: 'u1', stripeCustomerId: 'cus_ja_existe' },
    });

    await service.criarCheckout('u1', 'mensal');

    expect(customersCreate).not.toHaveBeenCalled();
    const params = checkoutCreate.mock.calls[0][0] as { customer: string };
    expect(params.customer).toBe('cus_ja_existe');
  });

  // Degradação: sem chave, a cobrança responde 503 e o RESTO do produto segue.
  it('503 quando a Stripe não está configurada', async () => {
    const { service } = build({ stripe: null });

    await expect(service.criarCheckout('u1', 'mensal')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('503 quando falta o STRIPE_PRICE_ID', async () => {
    const { service } = build({ env: { WEB_ORIGIN: 'https://x' } });

    await expect(service.criarCheckout('u1', 'mensal')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  // Falha da Stripe não vaza detalhe interno para o cliente — vai para o log/Sentry.
  it('erro da Stripe vira 503 com mensagem amigável', async () => {
    const { service } = build({
      stripe: {
        checkout: {
          sessions: { create: jest.fn().mockRejectedValue(new Error('boom')) },
        },
        customers: { create: jest.fn().mockResolvedValue({ id: 'cus_1' }) },
        billingPortal: { sessions: { create: jest.fn() } },
      },
    });

    await expect(service.criarCheckout('u1', 'mensal')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  describe('Customer Portal', () => {
    it('abre o portal do cliente já pagante', async () => {
      const { service, portalCreate } = build({
        assinatura: { id: 'a1', userId: 'u1', stripeCustomerId: 'cus_1' },
      });

      await expect(service.criarPortal('u1')).resolves.toEqual({
        url: 'https://billing.stripe.com/p/1',
      });
      expect(portalCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_1' }),
      );
    });

    // Quem nunca pagou não tem o que gerenciar (e o Portal exige um customer).
    it('404 quando o usuário nunca chegou a pagar', async () => {
      const { service } = build({
        assinatura: { id: 'a1', userId: 'u1', stripeCustomerId: null },
      });

      await expect(service.criarPortal('u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
