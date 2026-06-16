import { EditalSourceRecord } from '../src/editais/connectors/edital-source-record';
import { EditalIngestionService } from '../src/editais/edital-ingestion.service';
import { EditalUpsertService } from '../src/editais/edital-upsert.service';
import { EditalFonte } from '../src/editais/edital-fonte.enum';

const buildRecord = (
  overrides: Partial<EditalSourceRecord> = {},
): EditalSourceRecord => ({
  fonte: EditalFonte.PNCP,
  idExterno: 'PNCP-1',
  orgaoNome: 'Município X',
  orgaoCnpj: null,
  uf: 'SC',
  municipioNome: 'Cidade',
  codigoIbge: '4200000',
  objeto: 'Pavimentação de via',
  modalidadeId: 4, // Concorrência (modalidade de obra)
  modalidadeNome: 'Concorrência - Eletrônica',
  valorEstimado: 100,
  dataPublicacao: new Date('2026-05-18T10:00:00Z'),
  prazoProposta: null,
  linkOrigem: null,
  situacao: null,
  rawPayload: {},
  ...overrides,
});

describe('EditalIngestionService', () => {
  let service: EditalIngestionService;
  let upsert: { upsert: jest.Mock };

  beforeEach(() => {
    upsert = { upsert: jest.fn().mockResolvedValue('created') };
    service = new EditalIngestionService(
      upsert as unknown as EditalUpsertService,
    );
  });

  it('classifica como obra e repassa isObra=true ao upsert', async () => {
    const record = buildRecord();

    const result = await service.ingest(record);

    expect(upsert.upsert).toHaveBeenCalledWith(record, true);
    expect(result).toEqual({ outcome: 'created', isObra: true });
  });

  it('marca não-obra (exclusão) e ainda assim persiste', async () => {
    const record = buildRecord({ objeto: 'Locação de veículos' });

    const result = await service.ingest(record);

    // Persistimos mesmo o não-obra, marcado (CLAUDE.md §3.3).
    expect(upsert.upsert).toHaveBeenCalledWith(record, false);
    expect(result.isObra).toBe(false);
  });

  it('propaga o outcome do upsert', async () => {
    upsert.upsert.mockResolvedValue('unchanged');

    const result = await service.ingest(buildRecord());

    expect(result.outcome).toBe('unchanged');
  });
});
