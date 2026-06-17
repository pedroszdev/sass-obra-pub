import { ConfigService } from '@nestjs/config';
import { CaptacaoJobService } from '../src/captacao/captacao-job.service';
import { EditalQuery } from '../src/editais/connectors/edital-query';
import { EditalSourceConnector } from '../src/editais/connectors/edital-source-connector';
import { EditalSourceRecord } from '../src/editais/connectors/edital-source-record';
import { EditalIngestionService } from '../src/editais/edital-ingestion.service';
import { SyncRunService } from '../src/editais/sync/sync-run.service';
import { SyncState } from '../src/editais/sync/sync-state.entity';
import { SyncStateService } from '../src/editais/sync/sync-state.service';
import { EditalFonte } from '../src/editais/edital-fonte.enum';
import { UsersService } from '../src/users/users.service';

const DAY = 86400000;

const fakeRecord = (id: string): EditalSourceRecord => ({
  fonte: EditalFonte.PNCP,
  idExterno: id,
  orgaoNome: 'o',
  orgaoCnpj: null,
  uf: 'SC',
  municipioNome: 'm',
  codigoIbge: '4200000',
  objeto: 'x',
  modalidadeId: 4,
  modalidadeNome: 'Concorrência',
  valorEstimado: null,
  dataPublicacao: new Date('2026-06-01T00:00:00Z'),
  prazoProposta: null,
  linkOrigem: null,
  situacao: null,
  rawPayload: {},
});

// Conector fake: captura as queries e emite records (ou lança).
function makeConnector(opts: {
  records?: EditalSourceRecord[];
  throws?: boolean;
}): { connector: EditalSourceConnector; queries: EditalQuery[] } {
  const queries: EditalQuery[] = [];
  const connector: EditalSourceConnector = {
    fonte: EditalFonte.PNCP,
    fetchEditais(query) {
      queries.push(query);
      return (async function* () {
        if (opts.throws) {
          throw new Error('boom');
        }
        for (const record of opts.records ?? []) {
          yield record;
        }
      })();
    },
  };
  return { connector, queries };
}

const buildState = (overrides: Partial<SyncState> = {}): SyncState =>
  ({
    id: 's',
    fonte: EditalFonte.PNCP,
    uf: 'SC',
    backfillDone: false,
    syncedUntil: null,
    consecutiveErrors: 0,
    ...overrides,
  }) as SyncState;

function makeService(
  connector: EditalSourceConnector,
  state: SyncState,
  ufs: string[] = ['SC'],
) {
  const ingestion = {
    ingest: jest.fn().mockResolvedValue({ outcome: 'created', isObra: true }),
  };
  const syncState = {
    getOrCreate: jest.fn().mockResolvedValue(state),
    markSynced: jest.fn().mockResolvedValue(undefined),
    recordError: jest.fn().mockResolvedValue(undefined),
  };
  const syncRun = { record: jest.fn().mockResolvedValue(undefined) };
  const users = { findDistinctUfs: jest.fn().mockResolvedValue(ufs) };
  const config = { get: jest.fn((_key: string, def: unknown) => def) };
  const service = new CaptacaoJobService(
    [connector],
    ingestion as unknown as EditalIngestionService,
    syncState as unknown as SyncStateService,
    syncRun as unknown as SyncRunService,
    users as unknown as UsersService,
    config as unknown as ConfigService,
  );
  return { service, ingestion, syncState, syncRun, users };
}

describe('CaptacaoJobService.runOnce', () => {
  it('sem UFs ativas: não chama o conector', async () => {
    const { connector, queries } = makeConnector({});
    const { service, ingestion } = makeService(connector, buildState(), []);

    await service.runOnce();

    expect(queries).toHaveLength(0);
    expect(ingestion.ingest).not.toHaveBeenCalled();
  });

  it('UF nova: backfill (~30 dias) e marca backfillDone', async () => {
    const { connector, queries } = makeConnector({
      records: [fakeRecord('a'), fakeRecord('b')],
    });
    const { service, ingestion, syncState, syncRun } = makeService(
      connector,
      buildState({ backfillDone: false }),
    );

    await service.runOnce();

    const q = queries[0];
    expect(
      Math.round((q.dataFinal.getTime() - q.dataInicial.getTime()) / DAY),
    ).toBe(30);
    expect(ingestion.ingest).toHaveBeenCalledTimes(2);
    expect(syncState.markSynced).toHaveBeenCalledWith(
      EditalFonte.PNCP,
      'SC',
      expect.any(Date),
      { backfill: true },
    );
    expect(syncRun.record).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'backfill',
        status: 'success',
        processed: 2,
      }),
    );
  });

  it('UF existente: incremental a partir do watermark (− overlap)', async () => {
    const syncedUntil = new Date('2026-06-10T00:00:00Z');
    const { connector, queries } = makeConnector({
      records: [fakeRecord('a')],
    });
    const { service, syncState } = makeService(
      connector,
      buildState({ backfillDone: true, syncedUntil }),
    );

    await service.runOnce();

    // dataInicial = watermark − 2 dias de overlap
    expect(queries[0].dataInicial.getTime()).toBe(
      syncedUntil.getTime() - 2 * DAY,
    );
    expect(syncState.markSynced).toHaveBeenCalledWith(
      EditalFonte.PNCP,
      'SC',
      expect.any(Date),
      { backfill: false },
    );
  });

  it('falha na fonte: registra erro e não derruba o run', async () => {
    const { connector } = makeConnector({ throws: true });
    const { service, syncState, syncRun } = makeService(
      connector,
      buildState(),
    );

    await expect(service.runOnce()).resolves.toBeUndefined();
    expect(syncState.recordError).toHaveBeenCalledWith(
      EditalFonte.PNCP,
      'SC',
      'boom',
    );
    expect(syncState.markSynced).not.toHaveBeenCalled();
    expect(syncRun.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', error: 'boom' }),
    );
  });
});
