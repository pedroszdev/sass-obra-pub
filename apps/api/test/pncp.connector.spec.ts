import { PncpConnector } from '../src/editais/connectors/pncp/pncp.connector';
import { EditalQuery } from '../src/editais/connectors/edital-query';
import { EditalSourceRecord } from '../src/editais/connectors/edital-source-record';
import { PncpContratacao } from '../src/editais/connectors/pncp/pncp.types';

const query: EditalQuery = {
  uf: 'SC',
  dataInicial: new Date('2026-05-17T12:00:00Z'),
  dataFinal: new Date('2026-06-16T12:00:00Z'),
};

const rawRecord = (id: string): PncpContratacao => ({
  numeroControlePNCP: id,
  orgaoEntidade: { razaoSocial: 'Órgão', cnpj: null },
  unidadeOrgao: {
    ufSigla: 'SC',
    municipioNome: 'Cidade',
    codigoIbge: '4200000',
  },
  objetoCompra: 'Obra de pavimentação',
  modalidadeId: 4,
  modalidadeNome: 'Concorrência - Eletrônica',
  valorTotalEstimado: 100,
  dataPublicacaoPncp: '2026-05-18T07:00:58',
  dataEncerramentoProposta: null,
  linkSistemaOrigem: null,
  situacaoCompraNome: null,
});

function pncpPage(
  records: PncpContratacao[],
  totalPaginas: number,
): Record<string, unknown> {
  return {
    data: records,
    totalRegistros: records.length,
    totalPaginas,
    numeroPagina: 1,
    paginasRestantes: 0,
    empty: records.length === 0,
  };
}

function fakeResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

async function collect(
  iterable: AsyncIterable<EditalSourceRecord>,
): Promise<EditalSourceRecord[]> {
  const out: EditalSourceRecord[] = [];
  for await (const item of iterable) {
    out.push(item);
  }
  return out;
}

describe('PncpConnector', () => {
  let connector: PncpConnector;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    connector = new PncpConnector();
    // Pula as pausas (delay entre páginas / backoff do 429).
    jest
      .spyOn(
        connector as unknown as { pause: (ms: number) => Promise<void> },
        'pause',
      )
      .mockResolvedValue(undefined);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('busca as duas modalidades e mapeia os registros', async () => {
    fetchMock.mockResolvedValue(fakeResponse(pncpPage([rawRecord('a')], 1)));

    const records = await collect(connector.fetchEditais(query));

    // Uma página por modalidade (4 e 5) = 2 chamadas, 2 registros.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(2);
    expect(records[0].fonte).toBe('PNCP');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('uf=SC');
    expect(url).toContain('codigoModalidadeContratacao=4');
    expect(url).toContain('pagina=1');
    expect(url).toContain('tamanhoPagina=50');
  });

  it('pagina até totalPaginas', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(pncpPage([rawRecord('a')], 2))) // mod 4, pág 1
      .mockResolvedValueOnce(fakeResponse(pncpPage([rawRecord('b')], 2))) // mod 4, pág 2
      .mockResolvedValueOnce(fakeResponse(pncpPage([rawRecord('c')], 1))); // mod 5, pág 1

    const records = await collect(connector.fetchEditais(query));

    expect(records.map((r) => r.idExterno)).toEqual(['a', 'b', 'c']);
    const segundaUrl = fetchMock.mock.calls[1][0] as string;
    expect(segundaUrl).toContain('pagina=2');
  });

  it('re-tenta no 429 e segue', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse('rate limited', 429)) // mod 4 pág 1: 429
      .mockResolvedValue(fakeResponse(pncpPage([rawRecord('a')], 1))); // retry + mod 5

    const records = await collect(connector.fetchEditais(query));

    expect(fetchMock).toHaveBeenCalledTimes(3); // 429 + retry (mod4) + mod5
    expect(records).toHaveLength(2);
  });

  it('trata resposta vazia (204) sem registros', async () => {
    fetchMock.mockResolvedValue(fakeResponse(null, 204));

    const records = await collect(connector.fetchEditais(query));

    expect(records).toHaveLength(0);
  });

  it('lança erro em status inesperado (não-2xx, não-429)', async () => {
    fetchMock.mockResolvedValue(fakeResponse('erro interno', 500));

    await expect(collect(connector.fetchEditais(query))).rejects.toThrow(
      /PNCP HTTP 500/,
    );
  });
});
