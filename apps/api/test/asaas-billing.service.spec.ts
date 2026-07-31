import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ConfigStoreService } from '../src/config/config-store.service';
import {
  AsaasBillingService,
  centavosParaReais,
  reaisParaCentavos,
} from '../src/assinaturas/asaas-billing.service';
import { AsaasClient } from '../src/assinaturas/asaas-client';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { User } from '../src/users/user.entity';

// T-212 — cliente no Asaas. Os testes guardam o que a medição do sandbox (T-209)
// ensinou, e que não se lê no código: o Asaas CRIA cliente sem documento e só
// recusa na cobrança, e não existe chave de idempotência como a da Stripe.

const CNPJ = '11222333000181';
const OUTRO_CNPJ = '04252011000110';

describe('AsaasBillingService (T-212)', () => {
  let client: { get: jest.Mock; post: jest.Mock };
  let assinaturas: { findOne: jest.Mock; update: jest.Mock };
  let users: { findOne: jest.Mock };
  let configStore: { getPrecos: jest.Mock };
  let service: AsaasBillingService;

  const montar = (cliente: unknown = client) =>
    new AsaasBillingService(
      cliente as AsaasClient | null,
      assinaturas as unknown as Repository<Assinatura>,
      users as unknown as Repository<User>,
      configStore as unknown as ConfigStoreService,
      {
        get: () => 'https://app.prumolicita.com.br',
      } as unknown as ConfigService,
    );

  beforeEach(() => {
    client = { get: jest.fn(), post: jest.fn() };
    assinaturas = {
      findOne: jest.fn().mockResolvedValue({ id: 'a1', asaasCustomerId: null }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    users = {
      findOne: jest.fn().mockResolvedValue({
        id: 'u1',
        name: 'Construtora',
        email: 'c@e.com',
        cnpj: CNPJ,
      }),
    };
    configStore = {
      getPrecos: jest
        .fn()
        .mockResolvedValue({ mensalCentavos: 14990, anualCentavos: 149900 }),
    };
    service = montar();
  });

  it('sem ASAAS_API_KEY responde 503 — não derruba o resto do produto (§8)', async () => {
    const semChave = montar(null);
    await expect(semChave.garantirCustomer('u1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('cria o cliente com externalReference = userId e grava o id', async () => {
    client.get.mockResolvedValue({ data: [] }); // nenhum órfão
    client.post.mockResolvedValue({ id: 'cus_novo' });

    const id = await service.garantirCustomer('u1');

    expect(id).toBe('cus_novo');
    expect(client.post).toHaveBeenCalledWith(
      '/customers',
      expect.objectContaining({ externalReference: 'u1', cpfCnpj: CNPJ }),
    );
    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      { asaasCustomerId: 'cus_novo' },
    );
  });

  it('NÃO marca `provider` ao criar o cliente — cliente não é cobrança', async () => {
    // Marcar aqui faria o /admin e a reconciliação acharem que a conta migrou,
    // quando ela só tem um cadastro do outro lado. Quem decide é a T-213.
    client.get.mockResolvedValue({ data: [] });
    client.post.mockResolvedValue({ id: 'cus_novo' });

    await service.garantirCustomer('u1');

    const patch = assinaturas.update.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(patch).not.toHaveProperty('provider');
  });

  it('reaproveita cliente órfão em vez de criar um segundo', async () => {
    // O Asaas NÃO tem chave de idempotência (a Stripe tem). Se uma tentativa
    // anterior criou o cliente e morreu antes de gravar o id, a retentativa
    // criaria um SEGUNDO cliente para a mesma pessoa sem esta busca.
    client.get.mockImplementation((caminho: string) =>
      caminho.startsWith('/customers?')
        ? Promise.resolve({ data: [{ id: 'cus_orfao', cpfCnpj: CNPJ }] })
        : Promise.resolve({ id: 'cus_orfao', cpfCnpj: CNPJ }),
    );

    const id = await service.garantirCustomer('u1');

    expect(id).toBe('cus_orfao');
    expect(client.post).not.toHaveBeenCalledWith(
      '/customers',
      expect.anything(),
    );
  });

  it('não chama o Asaas quando o id já está gravado', async () => {
    assinaturas.findOne.mockResolvedValue({
      id: 'a1',
      asaasCustomerId: 'cus_existente',
    });
    client.get.mockResolvedValue({ id: 'cus_existente', cpfCnpj: CNPJ });

    await expect(service.garantirCustomer('u1')).resolves.toBe('cus_existente');
    expect(client.post).not.toHaveBeenCalled();
  });

  describe('exigirDocumento (a barreira que a T-209 mostrou ser tardia)', () => {
    it('sem CNPJ e prestes a cobrar → 400 nosso, não 400 cru do Asaas', async () => {
      users.findOne.mockResolvedValue({
        id: 'u1',
        name: 'X',
        email: 'x@e.com',
        cnpj: null,
      });

      await expect(
        service.garantirCustomer('u1', { exigirDocumento: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.post).not.toHaveBeenCalled();
    });

    it('sem CNPJ e SEM cobrar → cria normalmente (o Asaas aceita)', async () => {
      users.findOne.mockResolvedValue({
        id: 'u1',
        name: 'X',
        email: 'x@e.com',
        cnpj: null,
      });
      client.get.mockResolvedValue({ data: [] });
      client.post.mockResolvedValue({ id: 'cus_sem_doc' });

      await expect(service.garantirCustomer('u1')).resolves.toBe('cus_sem_doc');
    });
  });

  describe('sincronização do documento', () => {
    it('preenche no Asaas quando lá está vazio e aqui não', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasCustomerId: 'cus_1',
      });
      client.get.mockResolvedValue({ id: 'cus_1', cpfCnpj: null });
      client.post.mockResolvedValue({ id: 'cus_1' });

      await service.garantirCustomer('u1');

      expect(client.post).toHaveBeenCalledWith('/customers/cus_1', {
        cpfCnpj: CNPJ,
      });
    });

    it('NÃO sobrescreve documento divergente — identidade fiscal não se troca sozinha', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasCustomerId: 'cus_1',
      });
      client.get.mockResolvedValue({ id: 'cus_1', cpfCnpj: OUTRO_CNPJ });

      await service.garantirCustomer('u1');

      expect(client.post).not.toHaveBeenCalled();
    });
  });

  it('usuário inexistente → 404 antes de qualquer chamada de rede', async () => {
    users.findOne.mockResolvedValue(null);

    await expect(service.garantirCustomer('u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  // ── T-213: conversão do trial ──

  describe('centavosParaReais (a fronteira onde a unidade muda)', () => {
    // 🔴 O risco desta task inteira mora aqui: nosso código fala CENTAVOS e o
    // Asaas fala REAIS. Errar isto cobra 100x do cartão de um cliente.
    it('converte centavos para reais', () => {
      expect(centavosParaReais(14990)).toBe(149.9);
      expect(centavosParaReais(100)).toBe(1);
      expect(centavosParaReais(149900)).toBe(1499);
    });

    it('não produz dízima de ponto flutuante', () => {
      // 0.1 + 0.2 !== 0.3 — dinheiro não perdoa isso.
      expect(centavosParaReais(1)).toBe(0.01);
      expect(centavosParaReais(3333)).toBe(33.33);
    });
  });

  describe('criarCheckout (cartão)', () => {
    beforeEach(() => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasCustomerId: 'cus_1',
      });
      client.get.mockResolvedValue({ id: 'cus_1', cpfCnpj: CNPJ });
    });

    it('manda o valor em REAIS, não em centavos', async () => {
      client.post.mockResolvedValue({ id: 'chk_1', link: 'https://pay/1' });

      await service.criarCheckout('u1', 'mensal');

      const corpo = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/checkouts',
      )![1] as { items: { value: number }[] };
      expect(corpo.items[0].value).toBe(149.9); // 14990 centavos
    });

    it('usa CREDIT_CARD + RECURRENT e NÃO manda endDate', async () => {
      // Cartão é o único meio aceito em RECURRENT (medido T-209), e assinatura
      // de SaaS não tem data de fim — o exemplo da doc traz endDate e copiá-lo
      // poria data de morte na cobrança.
      client.post.mockResolvedValue({ id: 'chk_1', link: 'https://pay/1' });

      await service.criarCheckout('u1', 'anual');

      const corpo = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/checkouts',
      )![1] as Record<string, unknown>;
      expect(corpo.billingTypes).toEqual(['CREDIT_CARD']);
      expect(corpo.chargeTypes).toEqual(['RECURRENT']);
      expect(corpo.subscription).not.toHaveProperty('endDate');
      expect((corpo.subscription as { cycle: string }).cycle).toBe('YEARLY');
    });

    it('NÃO altera o status da assinatura — quem libera é o webhook', async () => {
      client.post.mockResolvedValue({ id: 'chk_1', link: 'https://pay/1' });

      await service.criarCheckout('u1', 'mensal');

      for (const [, patch] of assinaturas.update.mock.calls as [
        unknown,
        Record<string, unknown>,
      ][]) {
        expect(patch).not.toHaveProperty('status');
      }
    });

    it('sem preço configurado → 503, e NADA é criado no Asaas', async () => {
      // Falha fechado: inventar preço é pior que não cobrar.
      configStore.getPrecos.mockResolvedValue(null);

      await expect(
        service.criarCheckout('u1', 'mensal'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('criarAssinaturaDireta (boleto/Pix)', () => {
    beforeEach(() => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasCustomerId: 'cus_1',
      });
      client.get.mockResolvedValue({ id: 'cus_1', cpfCnpj: CNPJ });
    });

    it('usa billingType UNDEFINED — boleto e Pix num caminho só', async () => {
      // A descoberta da T-209 que encolheu a T-208: o pagador escolhe o meio a
      // cada cobrança, então não são dois fluxos.
      client.post.mockResolvedValue({ id: 'sub_1', status: 'ACTIVE' });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const corpo = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/subscriptions',
      )![1] as Record<string, unknown>;
      expect(corpo.billingType).toBe('UNDEFINED');
      expect(corpo.value).toBe(149.9);
      expect(corpo.externalReference).toBe('u1');
    });

    it('grava o id e marca provider=asaas, sem tocar no status', async () => {
      client.post.mockResolvedValue({ id: 'sub_1', status: 'ACTIVE' });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const patch = assinaturas.update.mock.calls.at(-1)![1] as Record<
        string,
        unknown
      >;
      expect(patch).toMatchObject({
        asaasSubscriptionId: 'sub_1',
        provider: 'asaas',
      });
      // ⚠️ `status: ACTIVE` vem do Asaas e NÃO significa pago — significa que a
      // assinatura existe. Quem libera acesso é o webhook (T-214).
      expect(patch).not.toHaveProperty('status');
    });

    it('sem CNPJ → 400 antes de criar qualquer coisa no Asaas', async () => {
      users.findOne.mockResolvedValue({
        id: 'u1',
        name: 'X',
        email: 'x@e.com',
        cnpj: null,
      });

      await expect(
        service.criarAssinaturaDireta('u1', 'mensal'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  // ── T-216: portal do assinante ──

  describe('reaisParaCentavos (a volta da fronteira de unidade)', () => {
    it('converte reais para centavos', () => {
      expect(reaisParaCentavos(149.9)).toBe(14990);
      expect(reaisParaCentavos(100)).toBe(10000);
    });

    it('sobrevive ao ponto flutuante', () => {
      // 1.1 * 100 === 110.00000000000001 — sem Math.round isto vira 110.000...1
      expect(reaisParaCentavos(1.1)).toBe(110);
      expect(reaisParaCentavos(33.33)).toBe(3333);
    });

    it('ida e volta preserva o valor', () => {
      for (const c of [1, 100, 14990, 149900, 999999]) {
        expect(reaisParaCentavos(centavosParaReais(c))).toBe(c);
      }
    });
  });

  describe('detalhesPortal (T-216)', () => {
    it('sem assinatura no Asaas devolve vazio — é o estado do trial', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasSubscriptionId: null,
      });

      const r = await service.detalhesPortal('u1');

      expect(r).toEqual({ cobrancas: [], temGestaoExterna: false });
      expect(client.get).not.toHaveBeenCalled();
    });

    it('mapeia a cobrança com valor em CENTAVOS e as URLs hospedadas', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasSubscriptionId: 'sub_1',
      });
      client.get.mockResolvedValue({
        data: [
          {
            id: 'pay_1',
            value: 149.9, // o Asaas fala REAIS
            dueDate: '2026-09-06',
            status: 'PENDING',
            billingType: 'UNDEFINED',
            invoiceUrl: 'https://asaas/i/abc',
            bankSlipUrl: 'https://asaas/b/pdf/abc',
          },
        ],
      });

      const r = await service.detalhesPortal('u1');

      expect(r.cobrancas[0]).toMatchObject({
        valor: 14990, // nós falamos CENTAVOS
        status: 'PENDING',
        meio: 'UNDEFINED',
        pagarUrl: 'https://asaas/i/abc',
        boletoUrl: 'https://asaas/b/pdf/abc',
      });
    });

    it('temGestaoExterna é sempre false — o Asaas não tem portal', async () => {
      // O front usa este campo para escolher entre "abrir portal do provedor" e
      // "renderizar nossa tela". Fixá-lo em false é o que a T-207 mediu.
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasSubscriptionId: 'sub_1',
      });
      client.get.mockResolvedValue({ data: [] });

      expect((await service.detalhesPortal('u1')).temGestaoExterna).toBe(false);
    });

    it('provedor instável NÃO derruba a tela — devolve sem cobranças', async () => {
      // Sem isto, uma indisponibilidade do Asaas deixaria o assinante sem ver
      // sequer o próprio plano.
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasSubscriptionId: 'sub_1',
      });
      client.get.mockRejectedValue(new Error('502'));

      await expect(service.detalhesPortal('u1')).resolves.toEqual({
        cobrancas: [],
        temGestaoExterna: false,
      });
    });
  });

  describe('trocarPlano — na virada, sem proporcional (T-216)', () => {
    beforeEach(() => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasSubscriptionId: 'sub_1',
      });
      client.post.mockResolvedValue({
        id: 'sub_1',
        value: 1499,
        cycle: 'YEARLY',
        nextDueDate: '2026-10-06',
      });
    });

    it('NUNCA reescreve a cobrança já gerada (updatePendingPayments: false)', async () => {
      // 🔴 O ponto mais perigoso desta task. Com `true`, o Asaas reescreveria uma
      // cobrança que o cliente pode já estar pagando — inclusive um boleto já
      // impresso, com outro valor. Medido no sandbox: com `false`, a cobrança
      // pendente de R$100 seguiu intacta depois de trocar para R$1499/ano.
      await service.trocarPlano('u1', 'anual');

      expect(client.post).toHaveBeenCalledWith('/subscriptions/sub_1', {
        value: 1499,
        cycle: 'YEARLY',
        updatePendingPayments: false,
      });
    });

    it('devolve a data em que o plano novo passa a valer', async () => {
      // A tela PRECISA dizer isso junto do nome do plano: sem a data, "plano
      // anual" mente sobre a cobrança em aberto, que segue no valor antigo.
      const r = await service.trocarPlano('u1', 'anual');

      expect(r.plano).toBe('anual');
      expect(r.valeAPartirDe?.toISOString()).toContain('2026-10-06');
    });

    it('atualiza o plano local', async () => {
      await service.trocarPlano('u1', 'anual');
      expect(assinaturas.update).toHaveBeenCalledWith(
        { id: 'a1' },
        { plano: 'anual' },
      );
    });

    it('quem está em trial não troca plano — escolhe ao assinar', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasSubscriptionId: null,
      });

      await expect(service.trocarPlano('u1', 'anual')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(client.post).not.toHaveBeenCalled();
    });

    it('sem preço configurado → 503 antes de tocar no provedor', async () => {
      configStore.getPrecos.mockResolvedValue(null);

      await expect(service.trocarPlano('u1', 'anual')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(client.post).not.toHaveBeenCalled();
    });
  });
});
