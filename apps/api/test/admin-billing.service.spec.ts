import { Repository } from 'typeorm';
import { AdminBillingService } from '../src/admin/admin-billing.service';
import { AsaasBillingService } from '../src/assinaturas/asaas-billing.service';
import { AsaasEvent } from '../src/assinaturas/asaas-event.entity';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { User } from '../src/users/user.entity';

// Espelho de assinaturas + webhooks do /admin (T-192, T-221, simplificado na
// T-224).
//
// 📌 O MRR foi quebrado por provedor na T-221 porque Stripe e Asaas tinham
// fontes de preço diferentes, e multiplicar a base inteira por um preço só fazia
// metade do número sair errado. Com o corte da Stripe (T-224), aquela
// complexidade deixou de pagar por si e o cálculo voltou ao simples.

const PRECOS = {
  mensal: { valor: 24900, moeda: 'brl' },
  anual: { valor: 249000, moeda: 'brl' },
};

function build(
  opts: {
    ativosMensal?: number;
    ativosAnual?: number;
    precosThrow?: boolean;
  } = {},
) {
  const assinaturas = {
    count: jest
      .fn()
      .mockResolvedValueOnce(opts.ativosMensal ?? 0)
      .mockResolvedValueOnce(opts.ativosAnual ?? 0),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as Repository<Assinatura>;
  const users = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as Repository<User>;
  const eventosAsaas = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as Repository<AsaasEvent>;
  const asaas = {
    listarPrecos: opts.precosThrow
      ? jest.fn().mockRejectedValue(new Error('sem preço configurado'))
      : jest.fn().mockResolvedValue(PRECOS),
    detalhesPortal: jest.fn().mockResolvedValue({ cobrancas: [] }),
  } as unknown as AsaasBillingService;

  return {
    service: new AdminBillingService(assinaturas, users, eventosAsaas, asaas),
    eventosAsaas,
    assinaturas,
  };
}

describe('AdminBillingService.mrr', () => {
  it('soma mensais × preço + anuais × preço/12 (centavos)', async () => {
    const mrr = await build({ ativosMensal: 3, ativosAnual: 2 }).service.mrr();

    // 3×24900 + 2×round(249000/12)=2×20750=41500 → 74700 + 41500 = 116200
    expect(mrr?.mrrCentavos).toBe(116200);
    expect(mrr?.ativosMensal).toBe(3);
    expect(mrr?.ativosAnual).toBe(2);
  });

  // 🔴 O medo registrado no backlog. A defesa é contar ASSINATURA, não id de
  // provedor: conta migrada guarda o `stripe_subscription_id` como HISTÓRICO, e
  // contar por presença de id a duplicaria. Continua valendo depois do corte —
  // as colunas da Stripe ficaram no banco de propósito.
  it('conta migrada NÃO conta em dobro', async () => {
    const mrr = await build({ ativosMensal: 1 }).service.mrr();

    expect(mrr?.ativosMensal).toBe(1);
    expect(mrr?.mrrCentavos).toBe(24900);
  });

  // Zero é um fato; null é "não sei", e a tela mostra coisas diferentes. Sem
  // preço configurado a cobrança inteira responde 503 de propósito (T-213).
  it('sem preço configurado → null, não zero', async () => {
    const mrr = await build({
      ativosMensal: 5,
      precosThrow: true,
    }).service.mrr();

    expect(mrr).toBeNull();
  });

  it('sem assinante ativo → zero', async () => {
    const mrr = await build().service.mrr();

    expect(mrr?.mrrCentavos).toBe(0);
  });
});

describe('AdminBillingService.webhooks', () => {
  // Importa porque a fila do Asaas PARA sozinha após falhas seguidas (T-209):
  // esta lista é onde se desconfia disso a olho.
  it('lista os eventos do Asaas', async () => {
    const { service, eventosAsaas } = build();
    (eventosAsaas.findAndCount as jest.Mock).mockResolvedValue([
      [
        {
          id: 'evt_a',
          tipo: 'PAYMENT_CONFIRMED',
          // Nullable: o Asaas não carimba todo evento, e recusá-lo seria perder
          // uma cobrança confirmada (T-211).
          criadoEmAsaas: null,
          processadoEm: new Date('2026-08-02T10:00:00Z'),
        },
      ],
      1,
    ]);

    const p = await service.webhooks(1);

    expect(p.total).toBe(1);
    expect(p.data[0].tipo).toBe('PAYMENT_CONFIRMED');
    expect(p.data[0].criadoEmProvedor).toBeNull();
  });
});

describe('AdminBillingService.cobrancasDaConta', () => {
  it('conta do Asaas devolve as cobranças do portal', async () => {
    const { service, assinaturas } = build();
    (assinaturas.findOne as jest.Mock).mockResolvedValue({
      userId: 'u1',
      provider: 'asaas',
    });

    expect(await service.cobrancasDaConta('u1')).toEqual([]);
  });

  it('conta sem provider do Asaas devolve vazio', async () => {
    const { service, assinaturas } = build();
    (assinaturas.findOne as jest.Mock).mockResolvedValue({
      userId: 'u1',
      provider: null,
    });

    expect(await service.cobrancasDaConta('u1')).toEqual([]);
  });
});
