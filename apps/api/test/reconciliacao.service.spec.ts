import Stripe from 'stripe';
import { Repository } from 'typeorm';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';
import { ReconciliacaoService } from '../src/assinaturas/reconciliacao.service';

const T0 = new Date('2026-07-14T12:00:00Z');
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

function subStripe(
  status: string,
  fimPeriodo = new Date('2026-08-14T12:00:00Z'),
  cancelAtPeriodEnd = false,
) {
  return {
    id: 'sub_1',
    status,
    customer: 'cus_1',
    metadata: { userId: 'u1' },
    cancel_at_period_end: cancelAtPeriodEnd,
    items: { data: [{ current_period_end: unix(fimPeriodo) }] },
  } as unknown as Stripe.Subscription;
}

function build(
  over: {
    locais?: Partial<Assinatura>[];
    retrieve?: jest.Mock;
    semStripe?: boolean;
  } = {},
) {
  const retrieve =
    over.retrieve ?? jest.fn().mockResolvedValue(subStripe('active'));
  const stripe = over.semStripe ? null : { subscriptions: { retrieve } };
  const assinaturas = {
    find: jest.fn().mockResolvedValue(
      over.locais ?? [
        {
          id: 'a1',
          userId: 'u1',
          status: AssinaturaStatus.TRIALING,
          currentPeriodEnd: null,
          pastDueDesde: null,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        },
      ],
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ReconciliacaoService(
    stripe as unknown as Stripe | null,
    assinaturas as unknown as Repository<Assinatura>,
  );
  return { service, assinaturas, retrieve };
}

describe('ReconciliacaoService (T-143)', () => {
  // O caso que a task existe para consertar: o webhook de "pagou" se perdeu (o
  // Render hibernou), a assinatura local ficou em `trialing`, e o cliente que
  // PAGOU está preso no paywall. A reconciliação relê a Stripe e corrige.
  it('corrige o estado local que divergiu da Stripe', async () => {
    const { service, assinaturas } = build({
      retrieve: jest.fn().mockResolvedValue(subStripe('active')),
    });

    const r = await service.reconciliar(T0);

    expect(r).toEqual({ verificadas: 1, corrigidas: 1 });
    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({
        status: AssinaturaStatus.ACTIVE,
        currentPeriodEnd: new Date('2026-08-14T12:00:00Z'),
      }),
    );
  });

  // Já em dia: não escreve à toa (evita I/O e ruído de log a cada cron).
  it('não toca no que já está sincronizado', async () => {
    const { service, assinaturas } = build({
      locais: [
        {
          id: 'a1',
          userId: 'u1',
          status: AssinaturaStatus.ACTIVE,
          currentPeriodEnd: new Date('2026-08-14T12:00:00Z'),
          cancelAtPeriodEnd: false,
          pastDueDesde: null,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        },
      ],
      retrieve: jest.fn().mockResolvedValue(subStripe('active')),
    });

    const r = await service.reconciliar(T0);

    expect(r.corrigidas).toBe(0);
    expect(assinaturas.update).not.toHaveBeenCalled();
  });

  // O cancelamento pelo Portal é o caso que a Stripe NÃO reflete em status nem em
  // currentPeriodEnd — ela mantém `active` e só liga `cancel_at_period_end`. Se o
  // webhook desse evento se perder, a reconciliação PRECISA detectar a divergência
  // pela flag, senão a plataforma nunca sabe que o cliente cancelou.
  it('cancelamento no Portal: detecta pela flag e escreve', async () => {
    const fim = new Date('2026-08-14T12:00:00Z');
    const { service, assinaturas } = build({
      locais: [
        {
          id: 'a1',
          userId: 'u1',
          status: AssinaturaStatus.ACTIVE,
          currentPeriodEnd: fim,
          cancelAtPeriodEnd: false,
          pastDueDesde: null,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        },
      ],
      // Mesmo status e mesmo fim de período — só a flag mudou.
      retrieve: jest.fn().mockResolvedValue(subStripe('active', fim, true)),
    });

    const r = await service.reconciliar(T0);

    expect(r.corrigidas).toBe(1);
    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({
        status: AssinaturaStatus.ACTIVE,
        currentPeriodEnd: fim,
        cancelAtPeriodEnd: true,
      }),
    );
  });

  // A guarda nova não pode gerar escrita à toa: se a flag JÁ bate, segue no-op.
  it('cancelamento já refletido localmente → no-op', async () => {
    const fim = new Date('2026-08-14T12:00:00Z');
    const { service, assinaturas } = build({
      locais: [
        {
          id: 'a1',
          userId: 'u1',
          status: AssinaturaStatus.ACTIVE,
          currentPeriodEnd: fim,
          cancelAtPeriodEnd: true,
          pastDueDesde: null,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        },
      ],
      retrieve: jest.fn().mockResolvedValue(subStripe('active', fim, true)),
    });

    const r = await service.reconciliar(T0);

    expect(r.corrigidas).toBe(0);
    expect(assinaturas.update).not.toHaveBeenCalled();
  });

  // Só quem já falou com a Stripe (tem stripeSubscriptionId) é buscado — trial
  // local puro não tem o que reconciliar.
  it('busca só assinaturas com stripeSubscriptionId', async () => {
    const { service, assinaturas } = build();

    await service.reconciliar(T0);

    const where = assinaturas.find.mock.calls[0][0].where as Record<
      string,
      unknown
    >;
    expect(where).toHaveProperty('stripeSubscriptionId');
  });

  // Preserva o início da inadimplência: reconciliar não pode reiniciar a carência
  // (senão o inadimplente nunca seria bloqueado — mesma regra do webhook).
  it('past_due: preserva o pastDueDesde original', async () => {
    const inicio = new Date('2026-07-10T00:00:00Z');
    const { service, assinaturas } = build({
      locais: [
        {
          id: 'a1',
          userId: 'u1',
          status: AssinaturaStatus.PAST_DUE,
          currentPeriodEnd: new Date('2026-08-14T12:00:00Z'),
          pastDueDesde: inicio,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        },
      ],
      // A Stripe ainda diz past_due, mas com outro fim de período → força update.
      retrieve: jest
        .fn()
        .mockResolvedValue(
          subStripe('past_due', new Date('2026-09-14T12:00:00Z')),
        ),
    });

    await service.reconciliar(T0);

    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({ pastDueDesde: inicio }),
    );
  });

  // Uma assinatura que falha (sumiu na Stripe, rede) não pode derrubar as demais.
  it('isola a falha de uma assinatura das outras', async () => {
    const retrieve = jest
      .fn()
      .mockRejectedValueOnce(new Error('No such subscription'))
      .mockResolvedValueOnce(subStripe('active'));
    const { service, assinaturas } = build({
      locais: [
        {
          id: 'a1',
          userId: 'u1',
          stripeSubscriptionId: 'sub_x',
          status: AssinaturaStatus.TRIALING,
          currentPeriodEnd: null,
          pastDueDesde: null,
          stripeCustomerId: null,
        },
        {
          id: 'a2',
          userId: 'u2',
          stripeSubscriptionId: 'sub_1',
          status: AssinaturaStatus.TRIALING,
          currentPeriodEnd: null,
          pastDueDesde: null,
          stripeCustomerId: 'cus_1',
        },
      ],
      retrieve,
    });

    const r = await service.reconciliar(T0);

    expect(r.verificadas).toBe(2);
    expect(r.corrigidas).toBe(1); // a segunda foi corrigida apesar da 1ª falhar
    expect(assinaturas.update).toHaveBeenCalledTimes(1);
  });

  // Sem Stripe configurada, a reconciliação é um no-op (não quebra o cron).
  it('sem STRIPE configurada → no-op', async () => {
    const { service, assinaturas } = build({ semStripe: true });

    const r = await service.reconciliar(T0);

    expect(r).toEqual({ verificadas: 0, corrigidas: 0 });
    expect(assinaturas.find).not.toHaveBeenCalled();
  });
});
