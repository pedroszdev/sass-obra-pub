import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AsaasBillingService } from '../src/assinaturas/asaas-billing.service';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { ReembolsoService } from '../src/assinaturas/reembolso.service';
import { User } from '../src/users/user.entity';

// Reembolso como OPERAÇÃO DO DONO (decisão de 04/08): o cliente pede por
// e-mail, e aqui ele escolhe quem reembolsar. Não há fila de solicitações.
//
// ⚠️ Metade da task segue sendo da T-157: o CORTE DE ACESSO. Este serviço NÃO
// mexe em acesso — quem corta é o webhook `PAYMENT_REFUNDED`, quando o dinheiro
// de fato volta.

const NOW = new Date('2026-08-04T12:00:00Z');
const emDias = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

// Cartão CONFIRMED não traz `paymentDate` (medido no provedor) — o mock reflete
// isso, senão o teste passa contra um payload que nunca existe.
const cartaoPago = (over: Record<string, unknown> = {}) => ({
  id: 'pay_1',
  status: 'CONFIRMED',
  billingType: 'CREDIT_CARD',
  clientPaymentDate: emDias(-2),
  confirmedDate: emDias(-2),
  value: 249,
  subscription: 'sub_1',
  ...over,
});

function build(
  opts: {
    assinaturas?: Partial<Assinatura>[];
    pagamentos?: unknown[];
    cobrancasDaConta?: unknown[];
  } = {},
) {
  const linhas = (opts.assinaturas ?? [
    { id: 'a1', userId: 'u1', provider: 'asaas', asaasSubscriptionId: 'sub_1' },
  ]) as Assinatura[];

  const assinaturas = {
    find: jest.fn().mockResolvedValue(linhas),
    findOne: jest.fn().mockResolvedValue(linhas[0] ?? null),
  } as unknown as Repository<Assinatura>;

  const users = {
    find: jest.fn().mockResolvedValue([
      { id: 'u1', email: 'a@b.com' },
      { id: 'u2', email: 'c@d.com' },
    ]),
  } as unknown as Repository<User>;

  const estornar = jest.fn().mockResolvedValue(undefined);
  const asaas = {
    pagamentosRecentes: jest
      .fn()
      .mockResolvedValue(opts.pagamentos ?? [cartaoPago()]),
    cobrancasCruas: jest
      .fn()
      .mockResolvedValue(opts.cobrancasDaConta ?? [cartaoPago()]),
    estornar,
  } as unknown as AsaasBillingService;

  return {
    service: new ReembolsoService(assinaturas, users, asaas),
    estornar,
    asaas,
  };
}

describe('listarElegiveis', () => {
  it('lista quem tem pagamento estornável, com e-mail e valor em centavos', async () => {
    const lista = await build().service.listarElegiveis(NOW);

    expect(lista).toEqual([
      expect.objectContaining({
        userId: 'u1',
        email: 'a@b.com',
        paymentId: 'pay_1',
        valorCentavos: 24900,
        dentroDoPrazo: true,
      }),
    ]);
  });

  // 🔴 A API do Asaas não estorna boleto — devolver ali é transferência,
  // operação manual. Listá-lo daria ao dono um botão que sempre falha.
  it('boleto NÃO aparece', async () => {
    const lista = await build({
      pagamentos: [cartaoPago({ billingType: 'BOLETO' })],
    }).service.listarElegiveis(NOW);

    expect(lista).toEqual([]);
  });

  it('sem pagamento confirmado, ninguém aparece', async () => {
    const lista = await build({
      pagamentos: [
        cartaoPago({
          status: 'PENDING',
          clientPaymentDate: undefined,
          confirmedDate: undefined,
        }),
      ],
    }).service.listarElegiveis(NOW);

    expect(lista).toEqual([]);
  });

  it('fora do prazo APARECE, marcado — quem decide é o dono', async () => {
    // Fora dos 7 dias o reembolso deixa de ser direito e vira decisão
    // comercial. Esconder tiraria do dono justamente a escolha que ele pediu.
    const lista = await build({
      pagamentos: [
        cartaoPago({
          clientPaymentDate: emDias(-30),
          confirmedDate: emDias(-30),
        }),
      ],
    }).service.listarElegiveis(NOW);

    expect(lista).toHaveLength(1);
    expect(lista[0].dentroDoPrazo).toBe(false);
  });

  // No prazo o reembolso é DIREITO (art. 49 do CDC), não liberalidade — e o que
  // é direito não pode ficar no rodapé da lista.
  it('quem está no prazo vem primeiro', async () => {
    const lista = await build({
      assinaturas: [
        { id: 'a1', userId: 'u1', asaasSubscriptionId: 'sub_velho' },
        { id: 'a2', userId: 'u2', asaasSubscriptionId: 'sub_1' },
      ] as Partial<Assinatura>[],
      pagamentos: [
        cartaoPago({
          id: 'pay_velho',
          subscription: 'sub_velho',
          clientPaymentDate: emDias(-30),
          confirmedDate: emDias(-30),
        }),
        cartaoPago(),
      ],
    }).service.listarElegiveis(NOW);

    expect(lista.map((c) => c.dentroDoPrazo)).toEqual([true, false]);
  });

  it('provedor sem cobranças → lista vazia, não exceção', async () => {
    // É leitura para decidir, não caminho de pagamento: a tela mostra "ninguém
    // elegível" em vez de quebrar.
    const lista = await build({ pagamentos: [] }).service.listarElegiveis(NOW);
    expect(lista).toEqual([]);
  });
});

describe('reembolsar', () => {
  it('estorna a cobrança mais recente da conta', async () => {
    const { service, estornar } = build();

    const r = await service.reembolsar('u1', NOW);

    expect(estornar).toHaveBeenCalledWith('pay_1');
    expect(r).toEqual({ paymentId: 'pay_1', valorCentavos: 24900 });
  });

  // ⚠️ Recalcula em vez de confiar no id que a tela mandou: a aba pode estar
  // aberta há horas, e estornar por id vindo do cliente devolveria uma cobrança
  // que já não é a atual.
  it('decide pelo estado ATUAL do provedor, não pelo que a tela mandou', async () => {
    const { service, estornar, asaas } = build({
      cobrancasDaConta: [cartaoPago({ id: 'pay_novo' })],
    });

    await service.reembolsar('u1', NOW);

    expect(asaas.cobrancasCruas).toHaveBeenCalledWith('sub_1');
    expect(estornar).toHaveBeenCalledWith('pay_novo');
  });

  it('conta sem assinatura no provedor recusa com mensagem', async () => {
    const { service, estornar } = build({
      assinaturas: [
        { id: 'a1', userId: 'u1', asaasSubscriptionId: null },
      ] as Partial<Assinatura>[],
    });

    await expect(service.reembolsar('u1', NOW)).rejects.toThrow(
      BadRequestException,
    );
    expect(estornar).not.toHaveBeenCalled();
  });

  it('sem pagamento a devolver, recusa', async () => {
    const { service, estornar } = build({
      cobrancasDaConta: [
        cartaoPago({
          status: 'PENDING',
          clientPaymentDate: undefined,
          confirmedDate: undefined,
        }),
      ],
    });

    await expect(service.reembolsar('u1', NOW)).rejects.toThrow(
      BadRequestException,
    );
    expect(estornar).not.toHaveBeenCalled();
  });

  it('boleto recusa explicando que a devolução é por transferência', async () => {
    const { service } = build({
      cobrancasDaConta: [cartaoPago({ billingType: 'BOLETO' })],
    });

    await expect(service.reembolsar('u1', NOW)).rejects.toThrow(
      /transfer[êe]ncia/i,
    );
  });
});
