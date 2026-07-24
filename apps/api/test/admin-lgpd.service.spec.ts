import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminLgpdService } from '../src/admin/admin-lgpd.service';
import { LgpdRequest } from '../src/admin/lgpd-request.entity';

// Fila LGPD (T-196): o prazo de resposta é lei (15 dias) e o registro do
// atendimento é a prova de conformidade do dono. Os testes travam o prazo, a
// ordenação por urgência e o carimbo do atendimento.

function build(overrides: Partial<Repository<LgpdRequest>> = {}) {
  const repo = {
    create: jest.fn((x: Partial<LgpdRequest>) => x as LgpdRequest),
    save: jest.fn((x: LgpdRequest) => Promise.resolve(x)),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn(),
    ...overrides,
  } as unknown as Repository<LgpdRequest>;
  return { repo, service: new AdminLgpdService(repo) };
}

describe('AdminLgpdService (T-196)', () => {
  it('criar fixa o prazo em 15 dias, status aberta e o admin', async () => {
    const { repo, service } = build();
    const now = new Date('2026-07-23T12:00:00.000Z');

    await service.criar(
      { tipo: 'exclusao', requesterEmail: 'x@y.com' },
      'admin1',
      now,
    );

    const salvo = (repo.save as jest.Mock).mock.calls[0][0] as LgpdRequest;
    expect(salvo.status).toBe('aberta');
    expect(salvo.createdByAdminId).toBe('admin1');
    expect(salvo.prazo.toISOString()).toBe('2026-08-07T12:00:00.000Z'); // +15d
    expect(salvo.userId).toBeNull();
  });

  it('listar filtra por status e ordena por prazo ASC (urgente primeiro)', async () => {
    const { repo, service } = build();
    await service.listar({ status: 'aberta', page: 2 });

    const args = (repo.findAndCount as jest.Mock).mock.calls[0][0];
    expect(args.where).toEqual({ status: 'aberta' });
    expect(args.order).toEqual({ prazo: 'ASC' });
    expect(args.skip).toBe(20); // (page 2 - 1) * 20
  });

  it('atualizar carimba atendidaEm ao virar terminal, sem sobrescrever', async () => {
    const registro = {
      id: 'r1',
      status: 'aberta',
      atendidaEm: null,
    } as LgpdRequest;
    const { service } = build({
      findOne: jest.fn().mockResolvedValue(registro),
    } as Partial<Repository<LgpdRequest>>);
    const now = new Date('2026-07-25T00:00:00.000Z');

    const out = await service.atualizar(
      'r1',
      { status: 'atendida', resolucao: 'exportado por e-mail' },
      now,
    );

    expect(out.status).toBe('atendida');
    expect(out.resolucao).toBe('exportado por e-mail');
    expect(out.atendidaEm).toBe(now);
  });

  it('atualizar não sobrescreve atendidaEm já gravado', async () => {
    const antes = new Date('2026-07-24T00:00:00.000Z');
    const registro = {
      id: 'r1',
      status: 'atendida',
      atendidaEm: antes,
    } as LgpdRequest;
    const { service } = build({
      findOne: jest.fn().mockResolvedValue(registro),
    } as Partial<Repository<LgpdRequest>>);

    const out = await service.atualizar(
      'r1',
      { status: 'recusada' },
      new Date(),
    );
    expect(out.atendidaEm).toBe(antes); // preservado
  });

  it('atualizar 404 quando não existe', async () => {
    const { service } = build({
      findOne: jest.fn().mockResolvedValue(null),
    } as Partial<Repository<LgpdRequest>>);
    await expect(
      service.atualizar('sumiu', { status: 'atendida' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
