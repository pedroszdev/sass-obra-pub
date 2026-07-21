import { Repository } from 'typeorm';
import { AdminCaptacaoService } from '../src/admin/admin-captacao.service';
import { SyncRun } from '../src/editais/sync/sync-run.entity';
import { NotificationLog } from '../src/notificacoes/notification-log.entity';

// Painel de captação (T-188). O que importa: a saúde reflete o último sucesso
// (verde < 48h) e os agregados vêm mapeados.

const NOW = new Date('2026-07-14T12:00:00Z');

function syncRun(over: Partial<SyncRun>): SyncRun {
  return {
    id: 'r1',
    fonte: 'PNCP',
    uf: 'SC',
    mode: 'incremental',
    status: 'success',
    processed: 10,
    created: 3,
    updated: 1,
    obras: 2,
    error: null,
    startedAt: NOW,
    finishedAt: NOW,
    durationMs: 1200,
    createdAt: NOW,
    ...over,
  } as SyncRun;
}

function build(ultimoSucesso: SyncRun | null) {
  const qb = {
    distinctOn: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getRawMany: jest
      .fn()
      .mockResolvedValue([{ dia: '2026-07-14', total: '5' }]),
  };
  const syncRuns = {
    findOne: jest.fn().mockResolvedValue(ultimoSucesso),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<SyncRun>;
  const notificacoes = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<NotificationLog>;
  return { service: new AdminCaptacaoService(syncRuns, notificacoes), qb };
}

describe('AdminCaptacaoService.painel (T-188)', () => {
  it('saudável quando o último sucesso foi há menos de 48h', async () => {
    const { service } = build(
      syncRun({ finishedAt: new Date(NOW.getTime() - 3 * 3600_000) }), // 3h atrás
    );
    const p = await service.painel(NOW);
    expect(p.saude.saudavel).toBe(true);
    expect(p.saude.horasDesde).toBe(3);
  });

  it('NÃO saudável quando passou de 48h', async () => {
    const { service } = build(
      syncRun({ finishedAt: new Date(NOW.getTime() - 50 * 3600_000) }),
    );
    const p = await service.painel(NOW);
    expect(p.saude.saudavel).toBe(false);
    expect(p.saude.horasDesde).toBe(50);
  });

  it('sem sucesso nenhum: não saudável e sem horas', async () => {
    const { service } = build(null);
    const p = await service.painel(NOW);
    expect(p.saude.saudavel).toBe(false);
    expect(p.saude.ultimoSucessoEm).toBeNull();
    expect(p.saude.horasDesde).toBeNull();
  });

  it('mapeia os alertas por dia (total numérico)', async () => {
    const { service } = build(syncRun({}));
    const p = await service.painel(NOW);
    expect(p.alertasPorDia).toEqual([{ dia: '2026-07-14', total: 5 }]);
  });
});
