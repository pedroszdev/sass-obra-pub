import { Repository } from 'typeorm';
import { AsaasBillingService } from '../src/assinaturas/asaas-billing.service';
import { AsaasClient } from '../src/assinaturas/asaas-client';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { NfseEmitida } from '../src/assinaturas/nfse-emitida.entity';
import { NfseService } from '../src/assinaturas/nfse.service';
import { User } from '../src/users/user.entity';

// NFS-e (T-219) — **aviso, não emissão** (decisão do dono, 04/08).
//
// 🔴 A emissão automática não foi construída porque o `invoiceSettings` do Asaas
// exige código de serviço municipal e descrição do serviço, que dependem da
// prefeitura e do contador — medido sondando o endpoint. Num caminho fiscal,
// código errado é ISS errado. O que o sistema faz é dizer o que ficou sem nota.

const NOW = new Date('2026-08-04T12:00:00Z');
const emDias = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

// Cartão CONFIRMED não traz `paymentDate` (medido) — o mock reflete o provedor.
const pago = (over: Record<string, unknown> = {}) => ({
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
    pagamentos?: unknown[];
    notas?: unknown[];
    marcadas?: string[];
    notasThrow?: boolean;
  } = {},
) {
  const get = jest.fn(() => {
    if (opts.notasThrow) return Promise.reject(new Error('502'));
    return Promise.resolve({ data: opts.notas ?? [] });
  });
  const asaas = { get } as unknown as AsaasClient;

  const save = jest.fn().mockResolvedValue(undefined);
  const emitidas = {
    find: jest
      .fn()
      .mockResolvedValue(
        (opts.marcadas ?? []).map((paymentId) => ({ paymentId })),
      ),
    save,
  } as unknown as Repository<NfseEmitida>;

  const assinaturas = {
    find: jest
      .fn()
      .mockResolvedValue([
        { userId: 'u1', asaasSubscriptionId: 'sub_1' } as Assinatura,
      ]),
  } as unknown as Repository<Assinatura>;

  const users = {
    find: jest.fn().mockResolvedValue([{ id: 'u1', email: 'a@b.com' }]),
  } as unknown as Repository<User>;

  const billing = {
    pagamentosRecentes: jest
      .fn()
      .mockResolvedValue(opts.pagamentos ?? [pago()]),
  } as unknown as AsaasBillingService;

  return {
    service: new NfseService(asaas, emitidas, assinaturas, users, billing),
    save,
  };
}

describe('pagamentosSemNota', () => {
  it('lista cobrança paga sem nota, com e-mail e valor em centavos', async () => {
    const lista = await build().service.pagamentosSemNota(NOW);

    expect(lista).toEqual([
      expect.objectContaining({
        paymentId: 'pay_1',
        email: 'a@b.com',
        valorCentavos: 24900,
      }),
    ]);
  });

  it('cobrança NÃO paga não gera obrigação', async () => {
    // Sem pagamento não há fato gerador de nota.
    const lista = await build({
      pagamentos: [pago({ status: 'PENDING' })],
    }).service.pagamentosSemNota(NOW);

    expect(lista).toEqual([]);
  });

  // Se um dia a emissão automática ligar, as notas aparecem no provedor e estas
  // cobranças somem daqui sozinhas — sem ninguém tocar neste código.
  it('cobrança que já tem nota no Asaas sai da lista', async () => {
    const lista = await build({
      notas: [{ id: 'inv_1', payment: 'pay_1', status: 'AUTHORIZED' }],
    }).service.pagamentosSemNota(NOW);

    expect(lista).toEqual([]);
  });

  // 🔴 Nota CANCELADA significa que a obrigação voltou a existir. Tratá-la como
  // resolvida esconderia justamente o caso que precisa de ação.
  it('nota CANCELADA não conta como resolvida', async () => {
    const lista = await build({
      notas: [{ id: 'inv_1', payment: 'pay_1', status: 'CANCELED' }],
    }).service.pagamentosSemNota(NOW);

    expect(lista).toHaveLength(1);
  });

  // 🔴 O que impede o alerta de virar ruído: sem esta marca ele repetiria sobre
  // a mesma cobrança a cada rodada, e alerta que repete deixa de ser lido.
  it('cobrança marcada como emitida à mão some da lista', async () => {
    const lista = await build({
      marcadas: ['pay_1'],
    }).service.pagamentosSemNota(NOW);

    expect(lista).toEqual([]);
  });

  it('fora da janela de 90 dias não vira trabalho novo', async () => {
    const lista = await build({
      pagamentos: [
        pago({ clientPaymentDate: emDias(-200), confirmedDate: emDias(-200) }),
      ],
    }).service.pagamentosSemNota(NOW);

    expect(lista).toEqual([]);
  });

  // Sem data não dá para dizer se está na janela — e cobrar nota de algo que
  // talvez seja antigo geraria trabalho inventado.
  it('pagamento sem data nenhuma é ignorado', async () => {
    const lista = await build({
      pagamentos: [
        pago({
          clientPaymentDate: undefined,
          confirmedDate: undefined,
          paymentDate: undefined,
        }),
      ],
    }).service.pagamentosSemNota(NOW);

    expect(lista).toEqual([]);
  });

  // ⚠️ `paymentDate` é NULO no cartão CONFIRMED (medido em 04/08) — contar por
  // ele deixaria toda cobrança de cartão fora da janela.
  it('usa clientPaymentDate, que é o que o cartão preenche', async () => {
    const lista = await build({
      pagamentos: [
        pago({ clientPaymentDate: emDias(-1), paymentDate: undefined }),
      ],
    }).service.pagamentosSemNota(NOW);

    expect(lista).toHaveLength(1);
  });

  // Sem a lista de notas do provedor, TODA cobrança pareceria pendente — e um
  // alerta sobre a base inteira treina o leitor a ignorá-lo. Melhor não alertar.
  it('falha ao listar notas propaga, em vez de alertar sobre tudo', async () => {
    await expect(
      build({ notasThrow: true }).service.pagamentosSemNota(NOW),
    ).rejects.toThrow();
  });
});

describe('marcarEmitida', () => {
  it('grava a cobrança, quem marcou e o número', async () => {
    const { service, save } = build();

    await service.marcarEmitida('pay_1', 'admin-1', 'NF-123', NOW);

    expect(save).toHaveBeenCalledWith({
      paymentId: 'pay_1',
      emitidaEm: NOW,
      emitidaPor: 'admin-1',
      numero: 'NF-123',
    });
  });

  it('número é opcional — exigi-lo faria o dono adiar a marcação', async () => {
    const { service, save } = build();

    await service.marcarEmitida('pay_1', 'admin-1', undefined, NOW);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ numero: null }),
    );
  });
});
