import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EditalSourceConnector } from '../src/editais/connectors/edital-source-connector';
import { EditalDocumentosService } from '../src/editais/edital-documentos.service';
import { Edital } from '../src/editais/edital.entity';
import { EditalFonte } from '../src/editais/edital-fonte.enum';

function build(over: { fetch?: jest.Mock; edital?: unknown } = {}) {
  const fetchEditalDocuments =
    over.fetch ??
    jest.fn().mockResolvedValue([
      { nome: 'Edital 87-2026.pdf', url: 'https://pncp/edital.pdf' },
      { nome: 'Planilha.pdf', url: 'https://pncp/planilha.pdf' },
    ]);
  const editais = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        over.edital === undefined
          ? { id: 'e1', fonte: EditalFonte.PNCP, idExterno: 'x-1-1/2026' }
          : over.edital,
      ),
  };
  const connector = {
    fonte: EditalFonte.PNCP,
    fetchEditalDocuments,
  } as unknown as EditalSourceConnector;
  const service = new EditalDocumentosService(
    editais as unknown as Repository<Edital>,
    [connector],
  );
  return { service, editais, fetchEditalDocuments };
}

describe('EditalDocumentosService (T-142)', () => {
  it('lista os documentos do conector, o principal primeiro', async () => {
    const { service } = build();

    const docs = await service.listar('e1');

    expect(docs.map((d) => d.nome)).toEqual([
      'Edital 87-2026.pdf',
      'Planilha.pdf',
    ]);
  });

  it('404 quando o edital não existe', async () => {
    const { service } = build({ edital: null });

    await expect(service.listar('sumiu')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // Cada abertura da tela (e cada F5) não pode virar um GET no PNCP.
  it('serve do cache dentro da janela e refaz a busca depois dela', async () => {
    const { service, fetchEditalDocuments } = build();
    const t0 = Date.now();

    await service.listar('e1', t0);
    await service.listar('e1', t0 + 60_000); // 1 min depois: cache
    expect(fetchEditalDocuments).toHaveBeenCalledTimes(1);

    await service.listar('e1', t0 + 11 * 60_000); // passou o TTL
    expect(fetchEditalDocuments).toHaveBeenCalledTimes(2);
  });

  // A fonte fora do ar não pode derrubar a tela do edital: o front ainda oferece
  // a página da compra, que é derivada e sempre existe.
  it('fonte fora do ar → lista vazia, sem lançar', async () => {
    const { service } = build({
      fetch: jest.fn().mockRejectedValue(new Error('PNCP fora')),
    });

    await expect(service.listar('e1')).resolves.toEqual([]);
  });

  it('sem conector para a fonte → lista vazia', async () => {
    const editais = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'e1', fonte: 'OUTRA', idExterno: 'x' }),
    };
    const service = new EditalDocumentosService(
      editais as unknown as Repository<Edital>,
      [],
    );

    await expect(service.listar('e1')).resolves.toEqual([]);
  });

  // REGRESSÃO — XSS pelo link do documento (T-142 + a guarda da T-119d).
  //
  // A URL vem VERBATIM do feed da fonte (o conector só repassa: `a.url ?? a.uri`)
  // e a T-142 a transformou em `href` na tela do edital. Um scheme perigoso ali
  // executa script na origem quando o empreiteiro clica em "Abrir edital (PDF)".
  // É a mesma ameaça que a T-119d já reconheceu no `linkOrigem`, que vem do MESMO
  // feed — este caminho só tinha ficado de fora da guarda.
  it.each([
    ['javascript:alert(document.cookie)', 'javascript:'],
    ['JaVaScRiPt:alert(1)', 'javascript: disfarçado de maiúsculas'],
    ['data:text/html,<script>alert(1)</script>', 'data:'],
    ['vbscript:msgbox(1)', 'vbscript:'],
    ['  javascript:alert(1)', 'javascript: com espaço à frente'],
    ['file:///etc/passwd', 'file:'],
  ])('descarta documento com scheme perigoso (%s)', async (url) => {
    const { service } = build({
      fetch: jest.fn().mockResolvedValue([
        { nome: 'Edital.pdf', url },
        { nome: 'Anexo.pdf', url: 'https://pncp/anexo.pdf' },
      ]),
    });

    const docs = await service.listar('e1');

    // O perigoso some; o legítimo continua servido.
    expect(docs).toEqual([
      { nome: 'Anexo.pdf', url: 'https://pncp/anexo.pdf' },
    ]);
  });

  it('preserva http e https — nenhum dos dois executa script', async () => {
    const { service } = build({
      fetch: jest.fn().mockResolvedValue([
        { nome: 'A.pdf', url: 'https://pncp/a.pdf' },
        { nome: 'B.pdf', url: 'http://prefeitura.sc.gov.br/b.pdf' },
      ]),
    });

    await expect(service.listar('e1')).resolves.toHaveLength(2);
  });

  // Todos perigosos: lista vazia, e o front cai na página da compra — o mesmo
  // caminho de quando a fonte não publicou arquivo. Nunca um href envenenado.
  it('todos os documentos perigosos → lista vazia, sem lançar', async () => {
    const { service } = build({
      fetch: jest
        .fn()
        .mockResolvedValue([
          { nome: 'Edital.pdf', url: 'javascript:alert(1)' },
        ]),
    });

    await expect(service.listar('e1')).resolves.toEqual([]);
  });
});
