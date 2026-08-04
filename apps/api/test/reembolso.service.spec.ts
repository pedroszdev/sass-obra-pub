import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AsaasBillingService } from '../src/assinaturas/asaas-billing.service';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { ReembolsoService } from '../src/assinaturas/reembolso.service';
import { RefundRequest } from '../src/assinaturas/refund-request.entity';

// Fluxo de solicitação de reembolso (T-218).
//
// ⚠️ Metade da task já existia: o CORTE DE ACESSO é da T-157, disparado pelo
// webhook `PAYMENT_REFUNDED`. Aqui é só o pedido — e a invariante mais
// importante é justamente que este código NÃO corta acesso.

const NOW = new Date('2026-08-04T12:00:00Z');
const emDias = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

function build(
  opts: {
    pendente?: Partial<RefundRequest> | null;
    pedido?: Partial<RefundRequest> | null;
    cobrancas?: unknown[];
    provider?: string | null;
  } = {},
) {
  const save = jest.fn((x: unknown) =>
    Promise.resolve({ id: 'r1', ...(x as object) }),
  );
  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const pedidos = {
    findOne: jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          where.status === 'pendente'
            ? (opts.pendente ?? null)
            : (opts.pedido ?? null),
        ),
      ),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((x: unknown) => x),
    save,
    update,
  } as unknown as Repository<RefundRequest>;

  const assinaturas = {
    findOne: jest.fn().mockResolvedValue({
      userId: 'u1',
      provider: opts.provider === undefined ? 'asaas' : opts.provider,
      asaasSubscriptionId: 'sub_1',
    }),
  } as unknown as Repository<Assinatura>;

  const estornar = jest.fn().mockResolvedValue(undefined);
  const asaas = {
    cobrancasCruas: jest.fn().mockResolvedValue(
      opts.cobrancas ?? [
        {
          id: 'pay_1',
          status: 'RECEIVED',
          billingType: 'CREDIT_CARD',
          // Cartão CONFIRMED não traz `paymentDate` (medido 04/08) — o mock
          // reflete o provedor, senão o teste passa contra um payload irreal.
          clientPaymentDate: emDias(-2),
          confirmedDate: emDias(-2),
          value: 249,
        },
      ],
    ),
    estornar,
  } as unknown as AsaasBillingService;

  return {
    service: new ReembolsoService(pedidos, assinaturas, asaas),
    save,
    update,
    estornar,
  };
}

describe('solicitar', () => {
  it('cria o pedido com o valor em CENTAVOS e o prazo congelado', async () => {
    const { service, save } = build();

    await service.solicitar('u1', 'não era o que eu esperava', NOW);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        paymentId: 'pay_1',
        // O Asaas fala reais; o resto do projeto fala centavos.
        valorCentavos: 24900,
        dentroDoPrazo: true,
        status: 'pendente',
      }),
    );
  });

  // ⚠️ Congelado, não recalculado na decisão: o prazo corre, e se o dono levar
  // dois dias para decidir, recalcular transformaria um pedido legítimo em fora
  // do prazo — punindo o cliente pela nossa demora.
  it('fora do prazo ainda cria o pedido, marcado como fora', async () => {
    const { service, save } = build({
      cobrancas: [
        {
          id: 'pay_1',
          status: 'RECEIVED',
          billingType: 'PIX',
          clientPaymentDate: emDias(-30),
          confirmedDate: emDias(-30),
          value: 249,
        },
      ],
    });

    await service.solicitar('u1', undefined, NOW);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ dentroDoPrazo: false }),
    );
  });

  // Clicar duas vezes não pode gerar duas solicitações, nem fazer o dono
  // trabalhar a mesma fila duas vezes.
  it('já havendo pedido pendente, devolve o mesmo', async () => {
    const { service, save } = build({
      pendente: { id: 'r-existente', status: 'pendente' } as RefundRequest,
    });

    const r = await service.solicitar('u1', undefined, NOW);

    expect(r.id).toBe('r-existente');
    expect(save).not.toHaveBeenCalled();
  });

  it('sem pagamento nenhum → recusa com mensagem, não pedido vazio', async () => {
    const { service } = build({ cobrancas: [] });
    await expect(service.solicitar('u1', undefined, NOW)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('conta da Stripe não tem cobrança do Asaas para reembolsar', async () => {
    const { service } = build({ provider: 'stripe' });
    await expect(service.solicitar('u1', undefined, NOW)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('aprovar', () => {
  const pendente = {
    id: 'r1',
    userId: 'u1',
    paymentId: 'pay_1',
    status: 'pendente',
    dentroDoPrazo: true,
  } as RefundRequest;

  it('estorna no provedor e marca aprovada', async () => {
    const { service, estornar, update } = build({ pedido: pendente });

    await service.aprovar('r1', 'admin-1', NOW);

    expect(estornar).toHaveBeenCalledWith('pay_1');
    expect(update).toHaveBeenCalledWith(
      { id: 'r1' },
      expect.objectContaining({ status: 'aprovada', decididoPor: 'admin-1' }),
    );
  });

  // 🔴 A invariante central: quem corta acesso é o webhook PAYMENT_REFUNDED
  // (T-157), quando o dinheiro VOLTA. Cortar na aprovação tiraria o acesso
  // antes de devolver — o pior dos dois mundos para o cliente.
  it('NÃO corta acesso — isso é do webhook', async () => {
    const { service, update } = build({ pedido: pendente });

    await service.aprovar('r1', 'admin-1', NOW);

    const patches = update.mock.calls.map(
      (c) => c[1] as Record<string, unknown>,
    );
    for (const p of patches) {
      expect(p).not.toHaveProperty('reembolsadaEm');
      expect(p).not.toHaveProperty('status', 'canceled');
    }
  });

  // Duas abas abertas não podem estornar duas vezes.
  it('pedido já decidido não estorna de novo', async () => {
    const { service, estornar } = build({
      pedido: { ...pendente, status: 'aprovada' } as RefundRequest,
    });

    await expect(service.aprovar('r1', 'admin-1', NOW)).rejects.toThrow(
      BadRequestException,
    );
    expect(estornar).not.toHaveBeenCalled();
  });
});

describe('recusar', () => {
  const pendente = {
    id: 'r1',
    userId: 'u1',
    paymentId: 'pay_1',
    status: 'pendente',
    dentroDoPrazo: true,
  } as RefundRequest;

  // 🔴 Não é burocracia: dentro dos 7 dias do CDC o reembolso é DIREITO do
  // cliente, e recusar ali é assumir risco jurídico. O registro escrito, com
  // autor e data, é o mínimo.
  it('exige justificativa', async () => {
    const { service, update } = build({ pedido: pendente });

    await expect(service.recusar('r1', 'admin-1', '  ', NOW)).rejects.toThrow(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('grava a justificativa, o autor e a data', async () => {
    const { service, update } = build({ pedido: pendente });

    await service.recusar('r1', 'admin-1', 'fora da política', NOW);

    expect(update).toHaveBeenCalledWith(
      { id: 'r1' },
      expect.objectContaining({
        status: 'recusada',
        notaDecisao: 'fora da política',
        decididoPor: 'admin-1',
        decididoEm: NOW,
      }),
    );
  });

  it('recusa NÃO estorna', async () => {
    const { service, estornar } = build({ pedido: pendente });
    await service.recusar('r1', 'admin-1', 'fora da política', NOW);
    expect(estornar).not.toHaveBeenCalled();
  });
});
