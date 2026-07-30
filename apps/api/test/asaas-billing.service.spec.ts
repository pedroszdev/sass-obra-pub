import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { AsaasBillingService } from '../src/assinaturas/asaas-billing.service';
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
  let service: AsaasBillingService;

  const montar = (cliente: unknown = client) =>
    new AsaasBillingService(
      cliente as AsaasClient | null,
      assinaturas as unknown as Repository<Assinatura>,
      users as unknown as Repository<User>,
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
});
