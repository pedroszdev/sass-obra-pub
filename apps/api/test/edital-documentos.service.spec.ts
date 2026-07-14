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
});
