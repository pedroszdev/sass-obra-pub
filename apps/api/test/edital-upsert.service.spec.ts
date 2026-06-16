import { Repository } from 'typeorm';
import { EditalSourceRecord } from '../src/editais/connectors/edital-source-record';
import { EditalUpsertService } from '../src/editais/edital-upsert.service';
import { Edital } from '../src/editais/edital.entity';
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
  objeto: 'Pavimentação',
  modalidadeId: 4,
  modalidadeNome: 'Concorrência - Eletrônica',
  valorEstimado: 100,
  dataPublicacao: new Date('2026-05-18T10:00:00Z'),
  prazoProposta: new Date('2026-06-09T17:00:00Z'),
  linkOrigem: 'http://x',
  situacao: 'Divulgada no PNCP',
  rawPayload: { a: 1 },
  ...overrides,
});

// Edital como ficaria no banco após inserir o registro.
const asEntity = (record: EditalSourceRecord, isObra = true): Edital =>
  ({
    id: 'e1',
    ...record,
    isObra,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Edital;

describe('EditalUpsertService', () => {
  let service: EditalUpsertService;
  let repo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    service = new EditalUpsertService(repo as unknown as Repository<Edital>);
  });

  it('insere quando é novo (created)', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.upsert(buildRecord(), true)).resolves.toBe('created');
    expect(repo.save).toHaveBeenCalledTimes(1);
    // insert: salvo sem id (o banco gera o uuid).
    expect(repo.save.mock.calls[0][0].id).toBeUndefined();
  });

  it('não duplica: registro idêntico → unchanged', async () => {
    const record = buildRecord();
    repo.findOne.mockResolvedValue(asEntity(record, true));

    await expect(service.upsert(record, true)).resolves.toBe('unchanged');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('atualiza quando um campo mudou (updated)', async () => {
    repo.findOne.mockResolvedValue(
      asEntity(buildRecord({ valorEstimado: 100 })),
    );

    await expect(
      service.upsert(buildRecord({ valorEstimado: 250 }), true),
    ).resolves.toBe('updated');
    expect(repo.save).toHaveBeenCalledTimes(1);
    // update: salvo com o id do existente.
    expect(repo.save.mock.calls[0][0].id).toBe('e1');
  });

  it('atualiza quando a classificação isObra mudou', async () => {
    const record = buildRecord();
    repo.findOne.mockResolvedValue(asEntity(record, false));

    await expect(service.upsert(record, true)).resolves.toBe('updated');
  });

  it('prazo nulo → preenchido conta como mudança', async () => {
    repo.findOne.mockResolvedValue(
      asEntity(buildRecord({ prazoProposta: null })),
    );

    await expect(
      service.upsert(
        buildRecord({ prazoProposta: new Date('2026-06-09T17:00:00Z') }),
        true,
      ),
    ).resolves.toBe('updated');
  });

  it('diferença de centavo só na precisão não conta como mudança', async () => {
    repo.findOne.mockResolvedValue(
      asEntity(buildRecord({ valorEstimado: 811261.27 })),
    );

    await expect(
      service.upsert(buildRecord({ valorEstimado: 811261.27 }), true),
    ).resolves.toBe('unchanged');
  });
});
