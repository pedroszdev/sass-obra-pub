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
import { AsaasClient, AsaasError } from '../src/assinaturas/asaas-client';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';
import { MailService } from '../src/mail/mail.service';
import { User } from '../src/users/user.entity';

// T-212 — cliente no Asaas. Os testes guardam o que a medição do sandbox (T-209)
// ensinou, e que não se lê no código: o Asaas CRIA cliente sem documento e só
// recusa na cobrança, e não existe chave de idempotência como a da Stripe.

const CNPJ = '11222333000181';
const OUTRO_CNPJ = '04252011000110';

describe('AsaasBillingService (T-212)', () => {
  let client: {
    get: jest.Mock;
    post: jest.Mock;
    put: jest.Mock;
    delete: jest.Mock;
  };
  let assinaturas: { findOne: jest.Mock; update: jest.Mock };
  let users: { findOne: jest.Mock };
  let configStore: { getPrecos: jest.Mock };
  let mail: { sendMail: jest.Mock };
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
      mail as unknown as MailService,
    );

  beforeEach(() => {
    client = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };
    mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
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

  describe('criarAssinaturaComCartao (substituiu o checkout hospedado)', () => {
    // 🔴 O checkout hospedado foi REMOVIDO em 01/08 (decisão do dono). Ele criava
    // cliente e assinatura por conta própria e nós só descobríamos depois, o que
    // produziu: cliente fantasma, assinatura duplicada cobrando em paralelo, CPF
    // do pagador em vez do CNPJ na nota (T-219) e a reativação que nunca
    // confirmava. Criando nós mesmos, os quatro somem.
    const CARTAO_NOVO = {
      holderName: 'PEDRO TESTE',
      number: '5162306219378829',
      expiryMonth: '05',
      expiryYear: '2031',
      ccv: '318',
    };
    const TITULAR_NOVO = {
      name: 'Pedro Teste',
      email: 'p@e.com',
      cpfCnpj: CNPJ,
      postalCode: '88010000',
      addressNumber: '100',
      phone: '48999999999',
    };

    beforeEach(() => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.TRIALING,
        currentPeriodEnd: null,
        asaasCustomerId: 'cus_1',
      });
      client.get.mockResolvedValue({ id: 'cus_1', cpfCnpj: CNPJ });
      client.post.mockResolvedValue({
        id: 'sub_novo',
        creditCard: { creditCardNumber: '8829', creditCardBrand: 'MASTERCARD' },
      });
    });

    const assinar = () =>
      service.criarAssinaturaComCartao(
        'u1',
        'mensal',
        { cartao: CARTAO_NOVO, titular: TITULAR_NOVO },
        '189.1.1.1',
      );

    it('usa o NOSSO cliente — é isso que põe o CNPJ na nota (T-219)', async () => {
      await assinar();

      const corpo = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/subscriptions',
      )![1] as Record<string, unknown>;
      // O checkout hospedado criava um cliente novo com o que o PAGADOR
      // digitasse — na prática o CPF dele. Aqui o cliente é o que já tem o CNPJ.
      expect(corpo.customer).toBe('cus_1');
      expect(corpo.billingType).toBe('CREDIT_CARD');
      expect(corpo.externalReference).toBe('u1');
    });

    it('manda o valor em REAIS e o IP do CLIENTE (antifraude)', async () => {
      await assinar();

      const corpo = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/subscriptions',
      )![1] as Record<string, unknown>;
      expect(corpo.value).toBe(149.9); // 14990 centavos
      expect(corpo.remoteIp).toBe('189.1.1.1');
    });

    it('devolve SÓ o mascarado — o PAN não volta para lugar nenhum', async () => {
      const r = await assinar();

      expect(r).toEqual({
        assinaturaId: 'sub_novo',
        ultimos4: '8829',
        bandeira: 'MASTERCARD',
      });
      expect(JSON.stringify(r)).not.toContain(CARTAO_NOVO.number);
      expect(JSON.stringify(r)).not.toContain(CARTAO_NOVO.ccv);
    });

    it('cartão recusado NÃO deixa assinatura pela metade', async () => {
      // O `POST` é atômico: ou cria com o cartão aprovado, ou não cria nada. Era
      // justamente o que o checkout hospedado não garantia.
      client.post.mockRejectedValue(
        new AsaasError(400, [], 'Transação não autorizada.'),
      );

      await expect(assinar()).rejects.toThrow();
      expect(assinaturas.update).not.toHaveBeenCalled();
    });

    it('NÃO marca a assinatura como paga — quem libera é o webhook', async () => {
      await assinar();

      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch).not.toHaveProperty('status');
      expect(patch.asaasSubscriptionId).toBe('sub_novo');
      expect(patch.provider).toBe('asaas');
    });

    it('reativando com cartão sai do estado "cancelada" na hora', async () => {
      // O mesmo bug do boleto/Pix: a 1ª cobrança fica no fim do período pago, e
      // esperar o `PAYMENT_CONFIRMED` deixaria a tela dizendo "Cancelada" até lá.
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.CANCELED,
        currentPeriodEnd: new Date('2099-01-01T00:00:00Z'),
        asaasCustomerId: 'cus_1',
      });

      await assinar();

      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch.status).toBe(AssinaturaStatus.ACTIVE);
      expect(patch.cancelAtPeriodEnd).toBe(false);
    });

    it('sem preço configurado → 503, e NADA é criado no Asaas', async () => {
      configStore.getPrecos.mockResolvedValue(null);

      await expect(assinar()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
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

      expect(r).toEqual({
        cobrancas: [],
        temGestaoExterna: false,
        valorCentavos: null,
      });
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
        // ⚠️ `null`, não o preço do catálogo: número plausível e errado sobre o
        // que sai da conta do cliente é pior que número nenhum.
        valorCentavos: null,
      });
    });
  });

  // 🔴 O valor da assinatura fica CONGELADO no provedor quando ela nasce: quem
  // assinou por X segue sendo debitado em X depois que o preço no /admin vira Y.
  // A tela lia o CATÁLOGO e anunciava Y — ou seja, dizia ao cliente um número
  // diferente do que sairia da conta dele (bug real, achado pelo dono em 04/08).
  describe('valor da assinatura no portal (T-216)', () => {
    it('devolve o valor DA ASSINATURA, não o do catálogo', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        asaasSubscriptionId: 'sub_1',
      });
      client.get.mockImplementation((caminho: string) =>
        caminho.includes('/payments')
          ? Promise.resolve({ data: [] })
          : // O provedor fala REAIS; o resto do projeto fala centavos.
            Promise.resolve({ id: 'sub_1', value: 249 }),
      );

      const portal = await service.detalhesPortal('u1');

      expect(portal.valorCentavos).toBe(24900);
    });

    // Número plausível e errado é pior que número nenhum — é sobre o que sai da
    // conta do cliente. A tela omite o valor em vez de cair no catálogo.
    it('provedor fora do ar → null, e a tela não inventa', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        asaasSubscriptionId: 'sub_1',
      });
      client.get.mockImplementation((caminho: string) =>
        caminho.includes('/payments')
          ? Promise.resolve({ data: [] })
          : Promise.reject(new Error('502')),
      );

      const portal = await service.detalhesPortal('u1');

      expect(portal.valorCentavos).toBeNull();
    });

    it('trial (sem assinatura no provedor) → null', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        asaasSubscriptionId: null,
      });

      const portal = await service.detalhesPortal('u1');

      expect(portal.valorCentavos).toBeNull();
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

  describe('trocarCartao — o único caminho que toca em cartão (SAQ A-EP)', () => {
    const CARTAO = {
      holderName: 'PEDRO TESTE',
      number: '4444444444444444',
      expiryMonth: '12',
      expiryYear: '2030',
      ccv: '123',
    };
    const TITULAR = {
      name: 'Pedro Teste',
      email: 'p@e.com',
      cpfCnpj: CNPJ,
      postalCode: '89010000',
      addressNumber: '100',
      phone: '47999999999',
    };

    beforeEach(() => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasSubscriptionId: 'sub_1',
      });
      client.put.mockResolvedValue({
        creditCard: { creditCardNumber: '8829', creditCardBrand: 'MASTERCARD' },
      });
    });

    it('devolve SÓ o mascarado — nunca o número', async () => {
      const r = await service.trocarCartao(
        'u1',
        {
          cartao: CARTAO,
          titular: TITULAR,
        },
        '187.10.10.10',
      );

      expect(r).toEqual({ ultimos4: '8829', bandeira: 'MASTERCARD' });
      expect(JSON.stringify(r)).not.toContain('4444444444444444');
    });

    it('NÃO persiste nada do cartão', async () => {
      // Invariante de conformidade: o número, o CVV e a validade não podem
      // encostar no banco. Se algum dia alguém "guardar para facilitar", este
      // teste quebra.
      await service.trocarCartao(
        'u1',
        { cartao: CARTAO, titular: TITULAR },
        '1.2.3.4',
      );

      const gravado = JSON.stringify(assinaturas.update.mock.calls);
      expect(gravado).not.toContain('4444444444444444');
      expect(gravado).not.toContain('123'); // ccv
    });

    it('manda o IP do CLIENTE — exigência antifraude do Asaas', async () => {
      await service.trocarCartao(
        'u1',
        { cartao: CARTAO, titular: TITULAR },
        '187.10.10.10',
      );

      expect(client.put).toHaveBeenCalledWith(
        '/subscriptions/sub_1/creditCard',
        expect.objectContaining({ remoteIp: '187.10.10.10' }),
      );
    });

    it('sem assinatura ativa → 400, sem mandar cartão para lugar nenhum', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        asaasSubscriptionId: null,
      });

      await expect(
        service.trocarCartao(
          'u1',
          { cartao: CARTAO, titular: TITULAR },
          '1.2.3.4',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.put).not.toHaveBeenCalled();
    });

    it('provedor sem confirmar a troca → 503, não sucesso silencioso', async () => {
      client.put.mockResolvedValue({}); // sem creditCard na resposta

      await expect(
        service.trocarCartao(
          'u1',
          { cartao: CARTAO, titular: TITULAR },
          '1.2.3.4',
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  // ── T-217: reativação sem cobrar duas vezes o mesmo mês ──
  //
  // No Asaas não existe "des-cancelar" (a assinatura é APAGADA), então voltar é
  // criar outra. E quem cancelou segue com acesso até o fim do que pagou — se a
  // assinatura nova nascesse vencendo hoje, a pessoa pagaria o mesmo mês duas
  // vezes. Medido no sandbox: `nextDueDate` futuro é aceito pelos dois caminhos
  // e a cobrança nasce vencendo na data pedida.
  describe('primeiro vencimento na reativação (T-217)', () => {
    const FIM_PERIODO = new Date('2026-09-30T03:00:00Z');

    beforeEach(() => {
      client.post.mockResolvedValue({ id: 'sub_novo', link: 'https://a/i/1' });
      client.get.mockResolvedValue({ data: [] });
    });

    it('cancelada com acesso em aberto → 1ª cobrança no FIM do período, não hoje', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.CANCELED,
        currentPeriodEnd: FIM_PERIODO,
        asaasCustomerId: 'cus_1',
      });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const corpo = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/subscriptions',
      )![1] as { nextDueDate: string };
      // 03:00Z é meia-noite de Brasília do dia 30 — a data tem que ser o dia 30,
      // não o 29 que um `toISOString()` cru poderia produzir noutro horário.
      expect(corpo.nextDueDate).toBe('2026-09-30');
    });

    // 🔴 Bug real, achado pelo dono ao clicar "Reativar": a assinatura NASCEU no
    // Asaas, mas a tela continuou dizendo "Cancelada". A causa é a própria regra
    // acima — a 1ª cobrança fica no FIM do período pago, que pode estar a um
    // ANO daqui. Se o sistema só aprendesse pelo `PAYMENT_CONFIRMED`, esperaria
    // esse ano inteiro para sair do estado cancelado.
    it('reativar sai do estado "cancelada" AGORA, sem esperar o pagamento', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.CANCELED,
        currentPeriodEnd: FIM_PERIODO,
        asaasCustomerId: 'cus_1',
      });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch.status).toBe(AssinaturaStatus.ACTIVE);
      expect(patch.cancelAtPeriodEnd).toBe(false);
      // ⚠️ O fim do período é REESCRITO com o MESMO valor que já tinha — a 1ª
      // cobrança adiada é justamente o fim do período pago. Escrita idempotente:
      // o acesso não muda, só o significado do estado.
      expect(patch.currentPeriodEnd).toEqual(FIM_PERIODO);
    });

    it('cancelada e JÁ vencida NÃO vira ativa sozinha — aí quem libera é o pagamento', async () => {
      // Sem período pago em aberto, marcar `active` daria o produto de graça a
      // quem não pagou. Este é o caso em que o webhook tem que mandar.
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.CANCELED,
        currentPeriodEnd: new Date('2020-01-01T00:00:00Z'),
        asaasCustomerId: 'cus_1',
      });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch).not.toHaveProperty('status');
      expect(patch).not.toHaveProperty('cancelAtPeriodEnd');
    });

    // 🔴 REGRESSÃO de 03/08, e a mesma de sempre pelo outro lado. Ao adiar a 1ª
    // cobrança da CONVERSÃO DE TRIAL para o fim do trial, o `PAYMENT_CONFIRMED`
    // deixou de chegar na hora — e a marcação local só cobria reativação. Quem
    // assinava via a assinatura nascer no Asaas e a plataforma seguir mostrando
    // o trial. A condição certa é "a cobrança foi adiada", não "está reativando".
    it('converter trial com dias restantes marca ACTIVE sem esperar o pagamento', async () => {
      const FIM_TRIAL = new Date(Date.now() + 4 * 86_400_000);
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: FIM_TRIAL,
        currentPeriodEnd: null,
        asaasCustomerId: 'cus_1',
      });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch.status).toBe(AssinaturaStatus.ACTIVE);
      // Sem isto a tela de confirmação mostrava "—" na próxima cobrança.
      expect(patch.currentPeriodEnd).toEqual(FIM_TRIAL);
    });

    it('trial com dias restantes adia a 1ª cobrança para o fim do trial', async () => {
      const FIM_TRIAL = new Date(Date.now() + 4 * 86_400_000);
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: FIM_TRIAL,
        currentPeriodEnd: null,
        asaasCustomerId: 'cus_1',
      });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const corpo = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/subscriptions',
      )![1] as { nextDueDate: string };
      expect(corpo.nextDueDate).not.toBe(new Date().toISOString().slice(0, 10));
    });

    // A contrapartida: quando a cobrança é HOJE, o status NÃO é antecipado —
    // dizer "ativo" antes de o dinheiro entrar é o erro oposto, e pior.
    it('cobrança hoje NÃO antecipa o status — quem ativa é o webhook', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: new Date(Date.now() - 86_400_000), // trial já vencido
        currentPeriodEnd: null,
        asaasCustomerId: 'cus_1',
      });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch).not.toHaveProperty('status');
      expect(patch).not.toHaveProperty('currentPeriodEnd');
    });

    it('assinatura nova (sem cancelamento) segue cobrando hoje', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.TRIALING,
        currentPeriodEnd: null,
        asaasCustomerId: 'cus_1',
      });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const corpo = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/subscriptions',
      )![1] as { nextDueDate: string };
      expect(corpo.nextDueDate).toBe(new Date().toISOString().slice(0, 10));
    });

    it('cancelada com o acesso JÁ vencido cobra hoje — não há período a respeitar', async () => {
      assinaturas.findOne.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: AssinaturaStatus.CANCELED,
        currentPeriodEnd: new Date('2020-01-01T00:00:00Z'),
        asaasCustomerId: 'cus_1',
      });

      await service.criarAssinaturaDireta('u1', 'mensal');

      const corpo = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/subscriptions',
      )![1] as { nextDueDate: string };
      expect(corpo.nextDueDate).toBe(new Date().toISOString().slice(0, 10));
    });
  });

  // ── T-217: cancelamento self-service ──
  //
  // Estes testes guardam o que o SANDBOX ensinou (medido em 31/07) e que não se
  // lê no código: no Asaas o cancelamento é `DELETE`, é imediato, não existe
  // "cancelar no fim do período", e a cobrança em aberto vai junto.
  describe('cancelar (T-217)', () => {
    const AGORA = new Date('2026-07-31T12:00:00Z');
    const FIM_PERIODO = new Date('2026-08-31T03:00:00Z');

    const ativa = (extra: Record<string, unknown> = {}) => ({
      id: 'a1',
      userId: 'u1',
      status: AssinaturaStatus.ACTIVE,
      asaasSubscriptionId: 'sub_1',
      currentPeriodEnd: FIM_PERIODO,
      canceladoEm: null,
      ...extra,
    });

    it('cancela no PROVEDOR e só então escreve no banco', async () => {
      // A ordem é a decisão de segurança da task: banco cancelado com provedor
      // ativo cortaria o acesso E seguiria cobrando.
      assinaturas.findOne.mockResolvedValue(ativa());
      const ordem: string[] = [];
      client.delete.mockImplementation(() => {
        ordem.push('provedor');
        return Promise.resolve({ deleted: true });
      });
      assinaturas.update.mockImplementation(() => {
        ordem.push('banco');
        return Promise.resolve(undefined);
      });

      await service.cancelar('u1', 'caro', undefined, AGORA);

      expect(client.delete).toHaveBeenCalledWith('/subscriptions/sub_1');
      expect(ordem).toEqual(['provedor', 'banco']);
    });

    it('falha do provedor NÃO escreve nada localmente', async () => {
      assinaturas.findOne.mockResolvedValue(ativa());
      client.delete.mockRejectedValue(new AsaasError(500, [], 'fora do ar'));

      await expect(
        service.cancelar('u1', 'caro', undefined, AGORA),
      ).rejects.toThrow();
      expect(assinaturas.update).not.toHaveBeenCalled();
    });

    it('404 no provedor não prende o cliente: cancela localmente mesmo assim', async () => {
      // A assinatura já não existe lá. Insistir em falhar deixaria a pessoa sem
      // conseguir encerrar um contrato que de fato já acabou.
      assinaturas.findOne.mockResolvedValue(ativa());
      client.delete.mockRejectedValue(
        new AsaasError(404, [], 'não encontrada'),
      );

      await expect(
        service.cancelar('u1', 'caro', undefined, AGORA),
      ).resolves.toEqual({ canceladoEm: AGORA, acessoAte: FIM_PERIODO });
      expect(assinaturas.update).toHaveBeenCalled();
    });

    it('PRESERVA o currentPeriodEnd — cancelar não corta o acesso na hora (T-144)', async () => {
      assinaturas.findOne.mockResolvedValue(ativa());
      client.delete.mockResolvedValue({ deleted: true });

      const r = await service.cancelar('u1', 'sem_obras', undefined, AGORA);

      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch).not.toHaveProperty('currentPeriodEnd');
      expect(patch.status).toBe(AssinaturaStatus.CANCELED);
      expect(patch.cancelAtPeriodEnd).toBe(true);
      expect(r.acessoAte).toBe(FIM_PERIODO);
    });

    it('grava motivo e detalhe — é o dado que a task existe para coletar', async () => {
      assinaturas.findOne.mockResolvedValue(ativa());
      client.delete.mockResolvedValue({ deleted: true });

      await service.cancelar('u1', 'sem_obras', 'nada em SC', AGORA);

      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch.cancelamentoMotivo).toBe('sem_obras');
      expect(patch.cancelamentoDetalhe).toBe('nada em SC');
      expect(patch.canceladoEm).toBe(AGORA);
    });

    it('carimba asaasAtualizadoEm — um pagamento a caminho não ressuscita o cancelamento', async () => {
      // Sem o carimbo, um PAYMENT_CONFIRMED criado ANTES do cancelamento chega
      // depois e devolve a assinatura para ACTIVE.
      assinaturas.findOne.mockResolvedValue(ativa());
      client.delete.mockResolvedValue({ deleted: true });

      await service.cancelar('u1', 'caro', undefined, AGORA);

      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch.asaasAtualizadoEm).toBe(AGORA);
    });

    it('sem currentPeriodEnd, busca o fim do período ANTES de apagar', async () => {
      // 🔴 Buraco real, achado em dev (31/07): a assinatura Asaas ativa estava
      // com `currentPeriodEnd` nulo, e sem essa data `calcularAcesso` NEGA o
      // acesso assim que o status vira `canceled` — cancelar cortaria na hora
      // justamente o que a T-144 promete manter.
      assinaturas.findOne.mockResolvedValue(ativa({ currentPeriodEnd: null }));
      client.get.mockResolvedValue({ nextDueDate: '2026-09-30' });
      client.delete.mockResolvedValue({ deleted: true });

      const r = await service.cancelar('u1', 'caro', undefined, AGORA);

      // Meia-noite de Brasília do dia 30, não do servidor (UTC).
      expect(r.acessoAte).toEqual(new Date('2026-09-30T03:00:00.000Z'));
      const patch = assinaturas.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch.currentPeriodEnd).toEqual(
        new Date('2026-09-30T03:00:00.000Z'),
      );
    });

    it('NÃO busca o fim do período de quem está inadimplente', async () => {
      // `nextDueDate` de um past_due também aponta para o futuro: usá-lo daria
      // acesso pago a quem não pagou. Quem manda ali é a carência.
      assinaturas.findOne.mockResolvedValue(
        ativa({ status: AssinaturaStatus.PAST_DUE, currentPeriodEnd: null }),
      );
      client.delete.mockResolvedValue({ deleted: true });

      const r = await service.cancelar('u1', 'caro', undefined, AGORA);

      expect(client.get).not.toHaveBeenCalled();
      expect(r.acessoAte).toBeNull();
    });

    it('falha ao ler o fim do período não impede o cancelamento', async () => {
      assinaturas.findOne.mockResolvedValue(ativa({ currentPeriodEnd: null }));
      client.get.mockRejectedValue(new AsaasError(502, [], 'timeout'));
      client.delete.mockResolvedValue({ deleted: true });

      await expect(
        service.cancelar('u1', 'caro', undefined, AGORA),
      ).resolves.toMatchObject({ acessoAte: null });
      expect(client.delete).toHaveBeenCalled();
    });

    it('cancelar duas vezes é no-op: não fala com o provedor nem reescreve o motivo', async () => {
      const jaCancelada = new Date('2026-07-20T10:00:00Z');
      assinaturas.findOne.mockResolvedValue(
        ativa({
          status: AssinaturaStatus.CANCELED,
          canceladoEm: jaCancelada,
          cancelamentoMotivo: 'caro',
        }),
      );

      const r = await service.cancelar('u1', 'outro', 'mudei', AGORA);

      expect(r).toEqual({
        canceladoEm: jaCancelada,
        acessoAte: FIM_PERIODO,
      });
      expect(client.delete).not.toHaveBeenCalled();
      expect(assinaturas.update).not.toHaveBeenCalled();
    });

    it('quem está em trial recebe 400 com explicação, não erro genérico', async () => {
      assinaturas.findOne.mockResolvedValue(
        ativa({ status: AssinaturaStatus.TRIALING, asaasSubscriptionId: null }),
      );

      await expect(
        service.cancelar('u1', 'caro', undefined, AGORA),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.delete).not.toHaveBeenCalled();
    });

    it('sem assinatura nenhuma → 404', async () => {
      assinaturas.findOne.mockResolvedValue(null);

      await expect(
        service.cancelar('u1', 'caro', undefined, AGORA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('manda o e-mail com a data do fim do acesso, no fuso de Brasília', async () => {
      assinaturas.findOne.mockResolvedValue(ativa());
      client.delete.mockResolvedValue({ deleted: true });

      await service.cancelar('u1', 'caro', undefined, AGORA);
      // O envio é em segundo plano (§8): só depois do microtask ele aconteceu.
      await Promise.resolve();
      await Promise.resolve();

      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      const enviado = mail.sendMail.mock.calls[0][0] as {
        to: string;
        text: string;
      };
      expect(enviado.to).toBe('c@e.com');
      // 2026-08-31T03:00:00Z é meia-noite de Brasília do dia 31 — o e-mail
      // precisa dizer 31/08, não 30/08. É o defeito de fuso que o §8 registra.
      expect(enviado.text).toContain('31/08/2026');
    });

    it('e-mail que falha NÃO derruba o cancelamento', async () => {
      // O cancelamento já aconteceu no provedor: falhar a resposta faria o
      // cliente clicar de novo achando que não funcionou.
      assinaturas.findOne.mockResolvedValue(ativa());
      client.delete.mockResolvedValue({ deleted: true });
      mail.sendMail.mockRejectedValue(new Error('resend fora do ar'));

      await expect(
        service.cancelar('u1', 'caro', undefined, AGORA),
      ).resolves.toEqual({ canceladoEm: AGORA, acessoAte: FIM_PERIODO });
    });
  });
});
