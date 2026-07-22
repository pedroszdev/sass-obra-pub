import { NotFoundException } from '@nestjs/common';
import {
  Between,
  FindOperator,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { SearchEditaisDto } from '../src/editais/dto/search-editais.dto';
import {
  EditaisSearchService,
  OBJETO_BUSCA_SQL,
  buildEditalOrder,
  buildEditalWhere,
} from '../src/editais/editais-search.service';
import { Edital } from '../src/editais/edital.entity';
import { EditalFonte } from '../src/editais/edital-fonte.enum';
import {
  EditalExigencias,
  ExigenciasStatus,
} from '../src/editais/exigencias/edital-exigencias.entity';
import { UfCaptureService } from '../src/editais/uf-capture.service';

const dto = (overrides: Partial<SearchEditaisDto> = {}): SearchEditaisDto => ({
  ...overrides,
});

// T-114: buildEditalWhere passou a SEMPRE incluir `situacao` (edital em jogo:
// nem anulado/revogado/suspenso). É um Raw com função interna nova a cada
// chamada, então casamos por tipo. `base(extra)` monta o where esperado com os
// dois campos fixos (isObra + situacao) mais os filtros do caso.
const SITUACAO = expect.any(FindOperator);
const base = (extra: Record<string, unknown> = {}) => ({
  isObra: true,
  situacao: SITUACAO,
  // T-197: despublicados (oculto=true) somem da busca.
  oculto: false,
  ...extra,
});

describe('buildEditalWhere', () => {
  it('sem filtros: só obras em jogo', () => {
    expect(buildEditalWhere(dto())).toEqual(base());
  });

  it('exclui editais ocultos (curadoria T-197)', () => {
    expect(buildEditalWhere(dto())).toMatchObject({ oculto: false });
  });

  it('filtra por UF (uma → escalar)', () => {
    expect(buildEditalWhere(dto({ uf: ['SC'] }))).toEqual(base({ uf: 'SC' }));
  });

  it('filtra por várias UFs → IN (T-81)', () => {
    expect(buildEditalWhere(dto({ uf: ['SC', 'PR'] }))).toEqual(
      base({ uf: In(['SC', 'PR']) }),
    );
  });

  it('filtra por município (um → escalar)', () => {
    expect(buildEditalWhere(dto({ codigoIbge: ['4205407'] }))).toEqual(
      base({ codigoIbge: '4205407' }),
    );
  });

  it('filtra por vários municípios → IN (T-81)', () => {
    expect(
      buildEditalWhere(dto({ codigoIbge: ['4205407', '4106902'] })),
    ).toEqual(base({ codigoIbge: In(['4205407', '4106902']) }));
  });

  it('período com início e fim → Between', () => {
    expect(
      buildEditalWhere(
        dto({ dataInicio: '2026-05-01', dataFim: '2026-05-31' }),
      ),
    ).toEqual(
      base({
        dataPublicacao: Between(new Date('2026-05-01'), new Date('2026-05-31')),
      }),
    );
  });

  it('só início → MoreThanOrEqual', () => {
    expect(buildEditalWhere(dto({ dataInicio: '2026-05-01' }))).toEqual(
      base({ dataPublicacao: MoreThanOrEqual(new Date('2026-05-01')) }),
    );
  });

  it('só fim → LessThanOrEqual', () => {
    expect(buildEditalWhere(dto({ dataFim: '2026-05-31' }))).toEqual(
      base({ dataPublicacao: LessThanOrEqual(new Date('2026-05-31')) }),
    );
  });

  it('combina UF + município + período', () => {
    const where = buildEditalWhere(
      dto({ uf: ['SC'], codigoIbge: ['4205407'], dataInicio: '2026-05-01' }),
    );
    expect(Array.isArray(where)).toBe(false);
    const single = where as Exclude<typeof where, unknown[]>;
    expect(single.isObra).toBe(true);
    expect(single.situacao).toBeInstanceOf(FindOperator);
    expect(single.uf).toBe('SC');
    expect(single.codigoIbge).toBe('4205407');
    expect(single.dataPublicacao).toEqual(
      MoreThanOrEqual(new Date('2026-05-01')),
    );
  });

  it('faixa de valor → OR incluindo editais sem valor (IsNull)', () => {
    const where = buildEditalWhere(dto({ valorMin: 1000, valorMax: 80000 }));
    expect(where).toEqual([
      base({ valorEstimado: Between(1000, 80000) }),
      base({ valorEstimado: IsNull() }),
    ]);
  });

  it('só valorMin → MoreThanOrEqual (mais o ramo IsNull)', () => {
    const where = buildEditalWhere(dto({ valorMin: 1000 }));
    expect(where).toEqual([
      base({ valorEstimado: MoreThanOrEqual(1000) }),
      base({ valorEstimado: IsNull() }),
    ]);
  });

  it('só valorMax → LessThanOrEqual (mais o ramo IsNull)', () => {
    const where = buildEditalWhere(dto({ valorMax: 80000 }));
    expect(where).toEqual([
      base({ valorEstimado: LessThanOrEqual(80000) }),
      base({ valorEstimado: IsNull() }),
    ]);
  });

  it('filtra por modalidade → IN (T-80)', () => {
    expect(buildEditalWhere(dto({ modalidade: [4, 5] }))).toEqual(
      base({ modalidadeId: In([4, 5]) }),
    );
  });

  it('modalidade única → IN com um id', () => {
    expect(buildEditalWhere(dto({ modalidade: [5] }))).toEqual(
      base({ modalidadeId: In([5]) }),
    );
  });

  it('modalidade vazia não filtra', () => {
    expect(buildEditalWhere(dto({ modalidade: [] }))).toEqual(base());
  });

  it('modalidade carrega nos dois ramos do OR de valor', () => {
    const where = buildEditalWhere(dto({ modalidade: [4], valorMax: 80000 }));
    expect(where).toEqual([
      base({ modalidadeId: In([4]), valorEstimado: LessThanOrEqual(80000) }),
      base({ modalidadeId: In([4]), valorEstimado: IsNull() }),
    ]);
  });

  it('faixa de valor carrega os demais filtros nos dois ramos do OR', () => {
    const where = buildEditalWhere(dto({ uf: ['SC'], valorMax: 80000 }));
    expect(where).toEqual([
      base({ uf: 'SC', valorEstimado: LessThanOrEqual(80000) }),
      base({ uf: 'SC', valorEstimado: IsNull() }),
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
    expect(where).toEqual(base());
  });

  // T-114 — some da busca por SITUAÇÃO (anulado/revogado/suspenso), sempre.
  // (O SQL do operador é coberto em situacao.spec.ts.)
  it('sempre exclui edital morto por situação (condição Raw presente)', () => {
    const where = buildEditalWhere(dto()) as Exclude<
      ReturnType<typeof buildEditalWhere>,
      unknown[]
    >;
    expect(where.situacao).toBeInstanceOf(FindOperator);
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

  // T-114 — só editais com prazo em aberto (por data).
  it('somenteAbertos → condição de prazo (aberto ou sem prazo)', () => {
    const where = buildEditalWhere(dto({ somenteAbertos: true }));
    const single = where as Exclude<typeof where, unknown[]>;
    expect(single.prazoProposta).toBeInstanceOf(FindOperator);
  });

  it('sort=prazo aplica o só-abertos de forma implícita', () => {
    const where = buildEditalWhere(dto({ sort: 'prazo' }));
    const single = where as Exclude<typeof where, unknown[]>;
    expect(single.prazoProposta).toBeInstanceOf(FindOperator);
  });

  it('sem somenteAbertos e sort padrão → sem condição de prazo', () => {
    const where = buildEditalWhere(dto({ sort: 'recentes' }));
    expect(where).toEqual(base());
  });

  it('somenteAbertos carrega nos dois ramos do OR de valor', () => {
    const where = buildEditalWhere(
      dto({ somenteAbertos: true, valorMax: 80000 }),
    );
    const branches = where as Extract<typeof where, unknown[]>;
    expect(branches).toHaveLength(2);
    for (const branch of branches) {
      expect(branch.prazoProposta).toBeInstanceOf(FindOperator);
    }
  });
});

describe('buildEditalOrder (T-81)', () => {
  it('default/recentes → publicação mais nova primeiro', () => {
    expect(buildEditalOrder()).toEqual({ dataPublicacao: 'DESC', id: 'DESC' });
    expect(buildEditalOrder('recentes')).toEqual({
      dataPublicacao: 'DESC',
      id: 'DESC',
    });
  });

  it('prazo → mais próximo primeiro, sem prazo no fim', () => {
    expect(buildEditalOrder('prazo')).toEqual({
      prazoProposta: { direction: 'ASC', nulls: 'LAST' },
      id: 'DESC',
    });
  });

  it('valor → maior primeiro, sem valor no fim', () => {
    expect(buildEditalOrder('valor')).toEqual({
      valorEstimado: { direction: 'DESC', nulls: 'LAST' },
      id: 'DESC',
    });
  });
});

describe('EditaisSearchService', () => {
  let service: EditaisSearchService;
  let repo: { findAndCount: jest.Mock; findOne: jest.Mock; count: jest.Mock };
  let exigenciasRepo: { find: jest.Mock };
  let ufCapture: { triggerUfIfStale: jest.Mock };

  const row = (overrides: Partial<Edital> = {}): Edital =>
    ({
      id: 'e1',
      fonte: EditalFonte.PNCP,
      idExterno: '43465459000173-1-000319/2026',
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
    repo = { findAndCount: jest.fn(), findOne: jest.fn(), count: jest.fn() };
    // Por padrão nenhum resumo pronto (T-83). Cada teste pode sobrescrever.
    exigenciasRepo = { find: jest.fn().mockResolvedValue([]) };
    ufCapture = { triggerUfIfStale: jest.fn().mockResolvedValue(false) };
    service = new EditaisSearchService(
      repo as unknown as Repository<Edital>,
      exigenciasRepo as unknown as Repository<EditalExigencias>,
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
      where: base(),
      order: { dataPublicacao: 'DESC', id: 'DESC' },
      skip: 0,
      take: 20,
    });
  });

  it('marca resumoPronto a partir do cache de resumo IA (T-83)', async () => {
    repo.findAndCount.mockResolvedValue([
      [row({ id: 'e1' }), row({ id: 'e2' })],
      2,
    ]);
    // só e1 tem resumo pronto no cache.
    exigenciasRepo.find.mockResolvedValue([{ editalId: 'e1' }]);

    const result = await service.search(dto());

    expect(result.data.find((e) => e.id === 'e1')?.resumoPronto).toBe(true);
    expect(result.data.find((e) => e.id === 'e2')?.resumoPronto).toBe(false);
    // lê só o cache (resumo IS NOT NULL); não dispara IA.
    expect(exigenciasRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ resumo: Not(IsNull()) }),
      }),
    );
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

    const result = await service.search(dto({ uf: ['RJ'] }));

    expect(ufCapture.triggerUfIfStale).toHaveBeenCalledWith('RJ');
    expect(result.capturing).toBe(true);
  });

  it('multi-UF: dispara captação para cada UF (T-81)', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);
    ufCapture.triggerUfIfStale
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await service.search(dto({ uf: ['SC', 'PR'] }));

    expect(ufCapture.triggerUfIfStale).toHaveBeenCalledWith('SC');
    expect(ufCapture.triggerUfIfStale).toHaveBeenCalledWith('PR');
    expect(ufCapture.triggerUfIfStale).toHaveBeenCalledTimes(2);
    // capturing = true se QUALQUER UF disparou.
    expect(result.capturing).toBe(true);
  });

  it('aplica o sort no findAndCount (T-81: prazo)', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);

    await service.search(dto({ sort: 'prazo' }));

    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        order: {
          prazoProposta: { direction: 'ASC', nulls: 'LAST' },
          id: 'DESC',
        },
      }),
    );
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
    // T-142: a página da compra é DERIVADA do numeroControlePNCP — existe mesmo
    // quando o órgão não informou `linkSistemaOrigem`.
    expect(result.linkPncp).toBe(
      'https://pncp.gov.br/app/editais/43465459000173/2026/319',
    );
  });

  it('findById: lança NotFoundException quando não existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.findById('inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ---------------------------------------------------------------------------
// Contagem pública de editais abertos (rota da tela de login)
// ---------------------------------------------------------------------------
describe('contarAbertos (rota pública)', () => {
  let repo: { findAndCount: jest.Mock; findOne: jest.Mock; count: jest.Mock };
  let service: EditaisSearchService;
  const NOW = new Date('2026-07-09T12:00:00Z');

  beforeEach(() => {
    repo = { findAndCount: jest.fn(), findOne: jest.fn(), count: jest.fn() };
    service = new EditaisSearchService(
      repo as unknown as Repository<Edital>,
      { find: jest.fn() } as unknown as Repository<EditalExigencias>,
      { triggerUfIfStale: jest.fn() } as unknown as UfCaptureService,
    );
  });

  it('conta só obra, aberta e com situação ativa', async () => {
    repo.count.mockResolvedValue(436);

    await expect(service.contarAbertos(NOW)).resolves.toBe(436);

    const where = repo.count.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.isObra).toBe(true);
    // Prazo futuro OU nulo (favor recall) e situação não-inativa (T-114).
    expect(where.prazoProposta).toBeDefined();
    expect(where.situacao).toBeDefined();
  });

  // Rota sem autenticação: um COUNT por visita seria vetor de carga barato.
  it('serve do cache dentro da janela e refaz a query depois dela', async () => {
    repo.count.mockResolvedValue(10);
    await service.contarAbertos(NOW);
    await service.contarAbertos(new Date(NOW.getTime() + 60_000));
    expect(repo.count).toHaveBeenCalledTimes(1);

    repo.count.mockResolvedValue(11);
    const depois = await service.contarAbertos(
      new Date(NOW.getTime() + 6 * 60_000),
    );
    expect(repo.count).toHaveBeenCalledTimes(2);
    expect(depois).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Base do filtro de aptidão (T-53). O ponto crítico aqui é a ORDEM das queries:
// editais filtrados primeiro, exigências DESSES editais depois. O contrário
// carregava a tabela de exigências inteira (jsonb) na memória a cada busca
// "estou apto" e uma vez por usuário no job de notificações.
// ---------------------------------------------------------------------------
describe('findEditaisComExigencias (T-53)', () => {
  let repo: {
    find: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
  };
  let exigenciasRepo: { find: jest.Mock };
  let service: EditaisSearchService;

  const edital = (id: string): Edital =>
    ({
      id,
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
    }) as unknown as Edital;

  const exigenciasDe = (editalId: string) => ({
    editalId,
    exigencias: { resumoObjeto: 'Obra', certidoes: [] },
  });

  beforeEach(() => {
    repo = {
      find: jest.fn(),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    };
    exigenciasRepo = { find: jest.fn().mockResolvedValue([]) };
    service = new EditaisSearchService(
      repo as unknown as Repository<Edital>,
      exigenciasRepo as unknown as Repository<EditalExigencias>,
      { triggerUfIfStale: jest.fn() } as unknown as UfCaptureService,
    );
  });

  it('busca as exigências SÓ dos editais filtrados (não a tabela inteira)', async () => {
    repo.find.mockResolvedValue([edital('e1'), edital('e2')]);
    exigenciasRepo.find.mockResolvedValue([
      exigenciasDe('e1'),
      exigenciasDe('e2'),
    ]);

    const result = await service.findEditaisComExigencias(dto({ uf: ['SC'] }));

    // 1) editais primeiro, com o where da busca (região) aplicado.
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: base({ uf: 'SC' }) }),
    );
    // 2) exigências recortadas pelos ids daqueles editais — o `where` NUNCA pode
    //    ser só { status }, que varreria a tabela toda.
    expect(exigenciasRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          editalId: In(['e1', 'e2']),
          status: ExigenciasStatus.EXTRAIDO,
        },
      }),
    );
    expect(result.map((r) => r.edital.id)).toEqual(['e1', 'e2']);
  });

  it('não traz as colunas pesadas do edital (rawPayload/objetoBusca)', async () => {
    repo.find.mockResolvedValue([edital('e1')]);
    exigenciasRepo.find.mockResolvedValue([exigenciasDe('e1')]);

    const result = await service.findEditaisComExigencias(dto());

    const select = repo.find.mock.calls[0][0].select as Record<string, unknown>;
    expect(select.rawPayload).toBeUndefined();
    expect(select.objetoBusca).toBeUndefined();
    expect(select.objeto).toBe(true);
    expect(result[0].edital).not.toHaveProperty('rawPayload');
  });

  it('limita os candidatos (o cruzamento de aptidão roda em memória)', async () => {
    repo.find.mockResolvedValue([]);

    await service.findEditaisComExigencias(dto());

    expect(repo.find.mock.calls[0][0].take).toBe(1000);
  });

  it('descarta o edital que ainda não tem exigências extraídas', async () => {
    repo.find.mockResolvedValue([edital('e1'), edital('e2')]);
    exigenciasRepo.find.mockResolvedValue([exigenciasDe('e2')]); // só e2 analisado

    const result = await service.findEditaisComExigencias(dto());

    expect(result).toHaveLength(1);
    expect(result[0].edital.id).toBe('e2');
    expect(result[0].exigencias).toEqual(exigenciasDe('e2').exigencias);
  });

  it('sem editais na região: nem consulta as exigências', async () => {
    repo.find.mockResolvedValue([]);

    await expect(service.findEditaisComExigencias(dto())).resolves.toEqual([]);
    expect(exigenciasRepo.find).not.toHaveBeenCalled();
  });
});
