import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminAccountsService } from '../src/admin/admin-accounts.service';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';

// Lista/detalhe de contas do admin (T-184). A lista precisa aplicar cada filtro
// só quando presente; o detalhe precisa somar os contadores certos e falhar
// (404) para conta inexistente.

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as unknown as Repository<never>;
}

function buildQb(resultado: [unknown[], number]) {
  const chamadas: { sql: string; params?: Record<string, unknown> }[] = [];
  const qb: Record<string, jest.Mock> = {
    leftJoin: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>) => {
      chamadas.push({ sql, params });
      return qb;
    }),
    getManyAndCount: jest.fn().mockResolvedValue(resultado),
  };
  ['leftJoin', 'orderBy', 'skip', 'take'].forEach((m) =>
    qb[m].mockReturnValue(qb),
  );
  return { qb, chamadas };
}

const USER = {
  id: 'u1',
  email: 'fulano@empresa.com',
  name: 'Fulano',
  cnpj: '12345678000199',
  porte: 'ME',
  role: 'USER',
  emailVerifiedAt: new Date('2026-07-01'),
  createdAt: new Date('2026-06-01'),
  termsAcceptedAt: null,
  googleSub: null,
};

describe('AdminAccountsService.listar (T-184)', () => {
  it('aplica só os filtros presentes e mapeia a assinatura', async () => {
    const { qb, chamadas } = buildQb([[USER], 1]);
    const users = makeRepo({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });
    const assinaturas = makeRepo({
      find: jest
        .fn()
        .mockResolvedValue([
          { userId: 'u1', status: 'active', plano: 'anual' },
        ]),
    });
    const service = new AdminAccountsService(
      users,
      assinaturas,
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
    );

    const r = await service.listar({
      email: 'fulano',
      status: AssinaturaStatus.ACTIVE,
      emailVerificado: true,
      page: 1,
      pageSize: 20,
    });

    const sqls = chamadas.map((c) => c.sql);
    expect(sqls).toContain('u.email ILIKE :email');
    expect(sqls).toContain('a.status = :status');
    expect(sqls).toContain('u.email_verified_at IS NOT NULL');
    expect(sqls).not.toContain('u.cnpj LIKE :cnpj'); // cnpj ausente
    expect(r.total).toBe(1);
    expect(r.data[0].assinatura).toEqual({ status: 'active', plano: 'anual' });
    expect(r.data[0].emailVerificado).toBe(true);
  });

  it('filtra e-mail não verificado com IS NULL', async () => {
    const { qb, chamadas } = buildQb([[], 0]);
    const users = makeRepo({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });
    const service = new AdminAccountsService(
      users,
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
    );
    await service.listar({ emailVerificado: false, page: 1, pageSize: 20 });
    expect(chamadas.map((c) => c.sql)).toContain('u.email_verified_at IS NULL');
  });
});

describe('AdminAccountsService.detalhe (T-184)', () => {
  it('agrega perfil, sessões e contadores de uso', async () => {
    const users = makeRepo({ findOne: jest.fn().mockResolvedValue(USER) });
    const assinaturas = makeRepo({
      findOne: jest.fn().mockResolvedValue({
        status: 'trialing',
        plano: 'mensal',
        trialEndsAt: new Date('2026-07-10'),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        pastDueDesde: null,
        stripeCustomerId: 'cus_123',
      }),
    });
    const perfis = makeRepo({
      findOne: jest.fn().mockResolvedValue({
        razaoSocial: 'Empresa LTDA',
        telefone: '11999999999',
        capitalSocial: 100000,
        patrimonioLiquido: 50000,
        registroProfissionalTipo: 'CREA',
        registroProfissionalNumero: '123',
        registroProfissionalUf: 'SP',
      }),
    });
    const refresh = makeRepo({
      count: jest.fn().mockResolvedValue(2),
      findOne: jest
        .fn()
        .mockResolvedValue({ createdAt: new Date('2026-07-05') }),
    });
    const favoritos = makeRepo({ count: jest.fn().mockResolvedValue(3) });
    const propostas = makeRepo({ count: jest.fn().mockResolvedValue(1) });
    const certidoes = makeRepo({ count: jest.fn().mockResolvedValue(4) });
    const atestados = makeRepo({ count: jest.fn().mockResolvedValue(2) });
    const notificacoes = makeRepo({ count: jest.fn().mockResolvedValue(7) });

    const service = new AdminAccountsService(
      users,
      assinaturas,
      perfis,
      favoritos,
      propostas,
      certidoes,
      atestados,
      notificacoes,
      refresh,
    );

    const d = await service.detalhe('u1');
    expect(d.perfil?.registro.tipo).toBe('CREA');
    expect(d.assinaturaDetalhe?.stripeCustomerId).toBe('cus_123');
    expect(d.sessoes).toEqual({
      ativas: 2,
      ultimoAcesso: new Date('2026-07-05'),
    });
    expect(d.uso).toEqual({
      favoritos: 3,
      propostas: 1,
      alertasEnviados: 7,
      certidoes: 4,
      atestados: 2,
    });
    expect(d.googleVinculado).toBe(false);
  });

  it('404 para conta inexistente', async () => {
    const users = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = new AdminAccountsService(
      users,
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
      makeRepo(),
    );
    await expect(service.detalhe('zzz')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
