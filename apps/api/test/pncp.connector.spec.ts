import { PncpConnector } from '../src/editais/connectors/pncp/pncp.connector';
import { EditalQuery } from '../src/editais/connectors/edital-query';
import { EditalSourceRecord } from '../src/editais/connectors/edital-source-record';
import { PncpContratacao } from '../src/editais/connectors/pncp/pncp.types';
import { PNCP_MAX_ATTEMPTS } from '../src/editais/connectors/pncp/pncp.constants';

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

function fakeResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
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
  let pauseSpy: jest.SpyInstance;
  const originalFetch = global.fetch;

  beforeEach(() => {
    connector = new PncpConnector();
    // Pula as pausas (delay entre páginas / backoff de retry).
    pauseSpy = jest
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

    expect(fetchMock).toHaveBeenCalledTimes(2); // uma página por modalidade
    expect(records).toHaveLength(2);
    expect(records[0].fonte).toBe('PNCP');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('uf=SC');
    expect(url).toContain('codigoModalidadeContratacao=4');
    expect(url).toContain('tamanhoPagina=50');
  });

  it('fetchAtualizacoes usa o endpoint de atualização (T-114), mesmos params', async () => {
    fetchMock.mockResolvedValue(fakeResponse(pncpPage([rawRecord('a')], 1)));

    const records = await collect(connector.fetchAtualizacoes(query));

    expect(fetchMock).toHaveBeenCalledTimes(2); // uma página por modalidade
    expect(records).toHaveLength(2);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/contratacoes/atualizacao');
    expect(url).not.toContain('/contratacoes/publicacao');
    expect(url).toContain('uf=SC');
    expect(url).toContain('codigoModalidadeContratacao=4');
  });

  it('fetchEditais continua no endpoint de publicação', async () => {
    fetchMock.mockResolvedValue(fakeResponse(pncpPage([rawRecord('a')], 1)));

    await collect(connector.fetchEditais(query));

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/contratacoes/publicacao');
  });

  it('pagina até totalPaginas', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(pncpPage([rawRecord('a')], 2)))
      .mockResolvedValueOnce(fakeResponse(pncpPage([rawRecord('b')], 2)))
      .mockResolvedValueOnce(fakeResponse(pncpPage([rawRecord('c')], 1)));

    const records = await collect(connector.fetchEditais(query));

    expect(records.map((r) => r.idExterno)).toEqual(['a', 'b', 'c']);
    expect(fetchMock.mock.calls[1][0]).toContain('pagina=2');
  });

  it('re-tenta no 429 e segue', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse('rate limited', 429))
      .mockResolvedValue(fakeResponse(pncpPage([rawRecord('a')], 1)));

    const records = await collect(connector.fetchEditais(query));

    expect(fetchMock).toHaveBeenCalledTimes(3); // 429 + retry (mod4) + mod5
    expect(records).toHaveLength(2);
  });

  it('honra o header Retry-After no 429', async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse('limited', 429, { 'retry-after': '1' }),
      )
      .mockResolvedValue(fakeResponse(pncpPage([rawRecord('a')], 1)));

    await collect(connector.fetchEditais(query));

    // Retry-After: 1s → espera exatamente 1000ms (sem jitter).
    expect(pauseSpy).toHaveBeenCalledWith(1000);
  });

  it('re-tenta em erro 5xx e segue', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse('boom', 500))
      .mockResolvedValue(fakeResponse(pncpPage([rawRecord('a')], 1)));

    const records = await collect(connector.fetchEditais(query));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(records).toHaveLength(2);
  });

  it('re-tenta em timeout / erro de rede e segue', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockResolvedValue(fakeResponse(pncpPage([rawRecord('a')], 1)));

    const records = await collect(connector.fetchEditais(query));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(records).toHaveLength(2);
  });

  it('desiste após o máximo de tentativas em 5xx persistente', async () => {
    fetchMock.mockResolvedValue(fakeResponse('indisponível', 503));

    await expect(collect(connector.fetchEditais(query))).rejects.toThrow(
      /HTTP 503 persistente/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(PNCP_MAX_ATTEMPTS);
  });

  it('falha de imediato em 4xx que não é 429', async () => {
    fetchMock.mockResolvedValue(fakeResponse('bad request', 400));

    await expect(collect(connector.fetchEditais(query))).rejects.toThrow(
      /PNCP HTTP 400/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1); // sem retry
    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it('trata resposta vazia (204) sem registros', async () => {
    fetchMock.mockResolvedValue(fakeResponse(null, 204));

    const records = await collect(connector.fetchEditais(query));

    expect(records).toHaveLength(0);
  });

  it('T-118d: lança quando a paginação trunca (emitidos < totalRegistros)', async () => {
    // totalPaginas=1 faz parar na página 1, mas totalRegistros diz que há mais —
    // avançar o watermark aqui perderia editais de forma invisível.
    fetchMock.mockResolvedValue(
      fakeResponse({
        data: [rawRecord('a')],
        totalRegistros: 5,
        totalPaginas: 1,
        numeroPagina: 1,
        paginasRestantes: 0,
        empty: false,
      }),
    );

    await expect(collect(connector.fetchEditais(query))).rejects.toThrow(
      /paginação truncada/,
    );
  });
});
