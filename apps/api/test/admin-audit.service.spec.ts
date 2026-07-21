import { Repository } from 'typeorm';
import { AdminAuditLog } from '../src/admin/admin-audit-log.entity';
import { AdminAuditService } from '../src/admin/admin-audit.service';

// Filtro da consulta (T-182): período + ação, paginado. Um qb falso captura os
// andWhere aplicados para provar que cada filtro só entra quando presente.
function buildQb(resultado: [AdminAuditLog[], number]) {
  const chamadas: { sql: string; params: Record<string, unknown> }[] = [];
  const qb: Record<string, jest.Mock> = {
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    andWhere: jest.fn((sql: string, params: Record<string, unknown>) => {
      chamadas.push({ sql, params });
      return qb;
    }),
    getManyAndCount: jest.fn().mockResolvedValue(resultado),
  };
  // encadeamento fluente: todos menos os terminais devolvem o próprio qb
  qb.orderBy.mockReturnValue(qb);
  qb.skip.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  return { qb, chamadas };
}

function build(resultado: [AdminAuditLog[], number] = [[], 0]) {
  const { qb, chamadas } = buildQb(resultado);
  const repo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<AdminAuditLog>;
  return { service: new AdminAuditService(repo), qb, chamadas };
}

describe('AdminAuditService.listar (T-182)', () => {
  it('sem filtros não aplica nenhum andWhere e pagina', async () => {
    const { service, qb, chamadas } = build([[], 0]);
    const r = await service.listar({ page: 2, pageSize: 20 });
    expect(chamadas).toHaveLength(0);
    expect(qb.skip).toHaveBeenCalledWith(20); // (2-1)*20
    expect(qb.take).toHaveBeenCalledWith(20);
    expect(r).toEqual({ data: [], total: 0, page: 2, pageSize: 20 });
  });

  it('aplica período e ação quando presentes', async () => {
    const { service, chamadas } = build();
    const desde = new Date('2026-07-01T00:00:00Z');
    const ate = new Date('2026-07-21T00:00:00Z');
    await service.listar({
      desde,
      ate,
      acao: 'trial.extend',
      page: 1,
      pageSize: 20,
    });
    const sqls = chamadas.map((c) => c.sql);
    expect(sqls).toEqual([
      'a.created_at >= :desde',
      'a.created_at <= :ate',
      'a.action = :acao',
    ]);
    expect(chamadas[0].params).toEqual({ desde });
    expect(chamadas[2].params).toEqual({ acao: 'trial.extend' });
  });
});
