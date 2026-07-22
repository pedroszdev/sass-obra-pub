import { Repository } from 'typeorm';
import { AdminSearchLogService } from '../src/admin/admin-search-log.service';
import { SearchLog } from '../src/editais/search-log.entity';

// Read do log de buscas (T-199): totais, termos top e zerados por UF. O valor do
// produto está aqui — "tal região volta vazia".

function build(opts: {
  totalBuscas?: number;
  semResultado?: number;
  termos?: { termo: string; total: string }[];
  ufs?: { ufs: string; total: string }[];
  recentes?: Partial<SearchLog>[];
}) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest
      .fn()
      .mockResolvedValueOnce(opts.termos ?? [])
      .mockResolvedValueOnce(opts.ufs ?? []),
  };
  const repo = {
    count: jest
      .fn()
      .mockResolvedValueOnce(opts.totalBuscas ?? 0)
      .mockResolvedValueOnce(opts.semResultado ?? 0),
    find: jest.fn().mockResolvedValue(opts.recentes ?? []),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<SearchLog>;
  return { service: new AdminSearchLogService(repo), qb };
}

describe('AdminSearchLogService.resumo (T-199)', () => {
  it('monta totais, termos top e ufs zeradas com contagem numérica', async () => {
    const { service } = build({
      totalBuscas: 100,
      semResultado: 12,
      termos: [
        { termo: 'ponte', total: '8' },
        { termo: 'pavimentação', total: '5' },
      ],
      ufs: [{ ufs: 'AC', total: '4' }],
      recentes: [
        {
          id: 'b1',
          userId: 'u1',
          termo: 'ponte',
          ufs: ['AC'],
          municipios: null,
          valorMin: null,
          valorMax: null,
          createdAt: new Date('2026-07-14T10:00:00Z'),
        },
      ],
    });

    const r = await service.resumo({});
    expect(r.totalBuscas).toBe(100);
    expect(r.semResultado).toBe(12);
    expect(r.termosTop).toEqual([
      { termo: 'ponte', total: 8 },
      { termo: 'pavimentação', total: 5 },
    ]);
    expect(r.ufsZeradasTop).toEqual([{ ufs: 'AC', total: 4 }]);
    expect(r.recentesZeradas[0]).toMatchObject({
      id: 'b1',
      userId: 'u1',
      termo: 'ponte',
    });
  });

  it('aplica o período nas contagens quando presente', async () => {
    const { service, qb } = build({});
    const desde = new Date('2026-07-01T00:00:00Z');
    await service.resumo({ desde });
    // o período entra nas queries de agregação via andWhere
    expect(qb.andWhere).toHaveBeenCalledWith('s.created_at >= :desde', {
      desde,
    });
  });
});
