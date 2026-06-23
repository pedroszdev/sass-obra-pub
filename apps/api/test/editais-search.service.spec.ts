import { NotFoundException } from '@nestjs/common';
import {
  Between,
  FindOperator,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { SearchEditaisDto } from '../src/editais/dto/search-editais.dto';
import {
  EditaisSearchService,
  OBJETO_BUSCA_SQL,
  buildEditalWhere,
} from '../src/editais/editais-search.service';
import { Edital } from '../src/editais/edital.entity';
import { EditalFonte } from '../src/editais/edital-fonte.enum';
import { UfCaptureService } from '../src/editais/uf-capture.service';

const dto = (overrides: Partial<SearchEditaisDto> = {}): SearchEditaisDto => ({
  ...overrides,
});

describe('buildEditalWhere', () => {
  it('sem filtros: só obras', () => {
    expect(buildEditalWhere(dto())).toEqual({ isObra: true });
  });

  it('filtra por UF', () => {
    expect(buildEditalWhere(dto({ uf: 'SC' }))).toEqual({
      isObra: true,
      uf: 'SC',
    });
  });

  it('filtra por município (codigoIbge)', () => {
    expect(buildEditalWhere(dto({ codigoIbge: '4205407' }))).toEqual({
      isObra: true,
      codigoIbge: '4205407',
    });
  });

  it('período com início e fim → Between', () => {
    expect(
      buildEditalWhere(
        dto({ dataInicio: '2026-05-01', dataFim: '2026-05-31' }),
      ),
    ).toEqual({
      isObra: true,
      dataPublicacao: Between(new Date('2026-05-01'), new Date('2026-05-31')),
    });
  });

  it('só início → MoreThanOrEqual', () => {
    expect(buildEditalWhere(dto({ dataInicio: '2026-05-01' }))).toEqual({
      isObra: true,
      dataPublicacao: MoreThanOrEqual(new Date('2026-05-01')),
    });
  });

  it('só fim → LessThanOrEqual', () => {
    expect(buildEditalWhere(dto({ dataFim: '2026-05-31' }))).toEqual({
      isObra: true,
      dataPublicacao: LessThanOrEqual(new Date('2026-05-31')),
    });
  });

  it('combina UF + município + período', () => {
    const where = buildEditalWhere(
      dto({ uf: 'SC', codigoIbge: '4205407', dataInicio: '2026-05-01' }),
    );
    expect(Array.isArray(where)).toBe(false);
    const single = where as Exclude<typeof where, unknown[]>;
    expect(single.isObra).toBe(true);
    expect(single.uf).toBe('SC');
    expect(single.codigoIbge).toBe('4205407');
    expect(single.dataPublicacao).toEqual(
      MoreThanOrEqual(new Date('2026-05-01')),
    );
  });

  it('faixa de valor → OR incluindo editais sem valor (IsNull)', () => {
    const where = buildEditalWhere(dto({ valorMin: 1000, valorMax: 80000 }));
    expect(where).toEqual([
      { isObra: true, valorEstimado: Between(1000, 80000) },
      { isObra: true, valorEstimado: IsNull() },
    ]);
  });

  it('só valorMin → MoreThanOrEqual (mais o ramo IsNull)', () => {
    const where = buildEditalWhere(dto({ valorMin: 1000 }));
    expect(where).toEqual([
      { isObra: true, valorEstimado: MoreThanOrEqual(1000) },
      { isObra: true, valorEstimado: IsNull() },
    ]);
  });

  it('só valorMax → LessThanOrEqual (mais o ramo IsNull)', () => {
    const where = buildEditalWhere(dto({ valorMax: 80000 }));
    expect(where).toEqual([
      { isObra: true, valorEstimado: LessThanOrEqual(80000) },
      { isObra: true, valorEstimado: IsNull() },
    ]);
  });

  it('faixa de valor carrega os demais filtros nos dois ramos do OR', () => {
    const where = buildEditalWhere(dto({ uf: 'SC', valorMax: 80000 }));
    expect(where).toEqual([
      { isObra: true, uf: 'SC', valorEstimado: LessThanOrEqual(80000) },
      { isObra: true, uf: 'SC', valorEstimado: IsNull() },
    ]);
  });

  it('busca textual → objetoBusca vira condição Raw', () => {
    const where = buildEditalWhere(dto({ q: 'pavimentação' }));
    expect(Array.isArray(where)).toBe(false);
    const single = where as Exclude<typeof where, unknown[]>;
    expect(single.objetoBusca).toBeInstanceOf(FindOperator);
  });

  it('q vazio/só espaços → sem filtro textual', () => {
    // O DTO faz trim; aqui simulamos o resultado (string vazia).
    const where = buildEditalWhere(dto({ q: '' }));
    expect(where).toEqual({ isObra: true });
  });

  it('busca textual aplica-se aos dois ramos do OR de valor', () => {
    const where = buildEditalWhere(dto({ q: 'escola', valorMax: 80000 }));
    expect(Array.isArray(where)).toBe(true);
    const branches = where as Extract<typeof where, unknown[]>;
    expect(branches).toHaveLength(2);
    for (const branch of branches) {
      expect(branch.objetoBusca).toBeInstanceOf(FindOperator);
    }
  });

  it('OBJETO_BUSCA_SQL gera o fragmento full-text esperado', () => {
    expect(OBJETO_BUSCA_SQL('"Edital"."objeto_busca"')).toBe(
      `"Edital"."objeto_busca" @@ plainto_tsquery('portuguese', :q)`,
    );
  });
});

describe('EditaisSearchService', () => {
  let service: EditaisSearchService;
  let repo: { findAndCount: jest.Mock; findOne: jest.Mock };
  let ufCapture: { triggerUfIfStale: jest.Mock };

  const row = (overrides: Partial<Edital> = {}): Edital =>
    ({
      id: 'e1',
      fonte: EditalFonte.PNCP,
      orgaoNome: 'Município X',
      orgaoCnpj: null,
      uf: 'SC',
      municipioNome: 'Florianópolis',
      codigoIbge: '4205407',
      objeto: 'Pavimentação de via',
      modalidadeId: 4,
      modalidadeNome: 'Concorrência - Eletrônica',
      valorEstimado: 100,
      dataPublicacao: new Date('2026-05-18T10:00:00Z'),
      prazoProposta: null,
      linkOrigem: 'http://x',
      situacao: 'Divulgada no PNCP',
      isObra: true,
      rawPayload: { segredo: 'não vazar' },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as unknown as Edital;

  beforeEach(() => {
    repo = { findAndCount: jest.fn(), findOne: jest.fn() };
    ufCapture = { triggerUfIfStale: jest.fn().mockResolvedValue(false) };
    service = new EditaisSearchService(
      repo as unknown as Repository<Edital>,
      ufCapture as unknown as UfCaptureService,
    );
  });

  it('retorna envelope paginado com defaults (page 1, pageSize 20)', async () => {
    repo.findAndCount.mockResolvedValue([[row()], 1]);

    const result = await service.search(dto());

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(repo.findAndCount).toHaveBeenCalledWith({
      where: { isObra: true },
      order: { dataPublicacao: 'DESC', id: 'DESC' },
      skip: 0,
      take: 20,
    });
  });

  it('calcula skip/take a partir de page e pageSize', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);

    await service.search(dto({ page: 3, pageSize: 10 }));

    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('não vaza rawPayload nem objetoBusca na resposta', async () => {
    repo.findAndCount.mockResolvedValue([[row()], 1]);

    const result = await service.search(dto());

    expect(result.data[0]).not.toHaveProperty('rawPayload');
    expect(result.data[0]).not.toHaveProperty('objetoBusca');
    expect(result.data[0].objeto).toBe('Pavimentação de via');
  });

  it('sem UF: não dispara captação sob demanda (capturing false)', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);

    const result = await service.search(dto());

    expect(ufCapture.triggerUfIfStale).not.toHaveBeenCalled();
    expect(result.capturing).toBe(false);
  });

  it('com UF: dispara captação sob demanda e reflete o capturing', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);
    ufCapture.triggerUfIfStale.mockResolvedValue(true);

    const result = await service.search(dto({ uf: 'RJ' }));

    expect(ufCapture.triggerUfIfStale).toHaveBeenCalledWith('RJ');
    expect(result.capturing).toBe(true);
  });

  it('findById: retorna o detalhe completo sem vazar internos', async () => {
    repo.findOne.mockResolvedValue(row());

    const result = await service.findById('e1');

    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'e1' } });
    expect(result.id).toBe('e1');
    expect(result.linkOrigem).toBe('http://x');
    // Campos extras do detalhe (além da lista).
    expect(result.modalidadeId).toBe(4);
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
    // Internos não vazam.
    expect(result).not.toHaveProperty('rawPayload');
    expect(result).not.toHaveProperty('objetoBusca');
  });

  it('findById: lança NotFoundException quando não existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.findById('inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });
});
