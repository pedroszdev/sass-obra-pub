import { Repository } from 'typeorm';
import { SearchLog } from '../src/editais/search-log.entity';
import { SearchLogService } from '../src/editais/search-log.service';

// Write do log de buscas (T-199). Trava o que grava (e que arrays vazios/termo
// em branco viram null) e que o fire-and-forget não propaga erro.

function build() {
  const repo = {
    insert: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<SearchLog>;
  return { service: new SearchLogService(repo), repo };
}

describe('SearchLogService (T-199)', () => {
  it('grava os filtros e o total; normaliza vazios para null', async () => {
    const { service, repo } = build();
    await service.registrar({
      userId: 'u1',
      termo: '  ponte  ',
      ufs: ['SC'],
      municipios: [],
      valorMin: 1000,
      total: 0,
    });
    expect(repo.insert).toHaveBeenCalledWith({
      userId: 'u1',
      termo: 'ponte',
      ufs: ['SC'],
      municipios: null,
      valorMin: 1000,
      valorMax: null,
      total: 0,
    });
  });

  it('termo em branco vira null', async () => {
    const { service, repo } = build();
    await service.registrar({ userId: null, termo: '   ', total: 5 });
    expect((repo.insert as jest.Mock).mock.calls[0][0].termo).toBeNull();
  });

  it('trunca o termo em 200 caracteres', async () => {
    const { service, repo } = build();
    await service.registrar({ userId: null, termo: 'a'.repeat(300), total: 1 });
    expect((repo.insert as jest.Mock).mock.calls[0][0].termo).toHaveLength(200);
  });

  it('fire-and-forget NÃO propaga erro do insert', () => {
    const { service, repo } = build();
    (repo.insert as jest.Mock).mockRejectedValue(new Error('db caiu'));
    expect(() =>
      service.registrarEmSegundoPlano({ userId: null, total: 0 }),
    ).not.toThrow();
  });
});
