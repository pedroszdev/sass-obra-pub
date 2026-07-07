import { DocumentoTextoService } from '../src/editais/exigencias/documento-texto.service';

const MAX = 60 * 1024 * 1024;

// Response mínima que o fetch nativo devolveria (só o que o service usa).
function fakeResp(opts: {
  ok?: boolean;
  contentLength?: string | null;
  body?: Buffer;
}): Response {
  return {
    ok: opts.ok ?? true,
    headers: {
      get: (h: string) =>
        h === 'content-length' ? (opts.contentLength ?? null) : null,
    },
    arrayBuffer: () => Promise.resolve(opts.body ?? Buffer.alloc(0)),
  } as unknown as Response;
}

describe('DocumentoTextoService — cap de download (T-104)', () => {
  let service: DocumentoTextoService;
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    service = new DocumentoTextoService();
  });
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('ignora (null) quando o Content-Length passa do teto — sem bufferizar', async () => {
    const arrayBuffer = jest.fn();
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        fakeResp({ contentLength: String(MAX + 1) }),
      ) as unknown as typeof fetch;
    // Se cortou pelo header, nem chega a extrair do buffer.
    const spy = jest.spyOn(service, 'extrairDeBuffer');

    expect(await service.extrairDeUrl('http://x/edital.pdf')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('ignora (null) quando o corpo real passa do teto (header mentiu/faltou)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        fakeResp({ contentLength: null, body: Buffer.alloc(MAX + 1) }),
      ) as unknown as typeof fetch;
    const spy = jest.spyOn(service, 'extrairDeBuffer');

    expect(await service.extrairDeUrl('http://x/edital.pdf')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('propaga erro quando o download falha (HTTP não-ok)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(fakeResp({ ok: false })) as unknown as typeof fetch;
    await expect(service.extrairDeUrl('http://x/edital.pdf')).rejects.toThrow(
      /Falha ao baixar documento/,
    );
  });

  it('dentro do teto e sem ser PDF/ZIP, extrai e devolve null (sem cap)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        fakeResp({ contentLength: '10', body: Buffer.from('texto qualquer') }),
      ) as unknown as typeof fetch;
    // Buffer pequeno e não-PDF: extrairDeBuffer roda e resolve null (outro formato).
    expect(await service.extrairDeUrl('http://x/arquivo.txt')).toBeNull();
  });
});
