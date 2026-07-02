import { ConfigService } from '@nestjs/config';
import { EditalQuery } from '../src/editais/connectors/edital-query';
import { EditalSourceConnector } from '../src/editais/connectors/edital-source-connector';
import { EditalSourceRecord } from '../src/editais/connectors/edital-source-record';
import { EditalIngestionService } from '../src/editais/edital-ingestion.service';
import { EditalFonte } from '../src/editais/edital-fonte.enum';
import { SyncRunService } from '../src/editais/sync/sync-run.service';
import { SyncState } from '../src/editais/sync/sync-state.entity';
import { SyncStateService } from '../src/editais/sync/sync-state.service';
import { UfCaptureService } from '../src/editais/uf-capture.service';

const DAY = 86_400_000;
const HOUR = 3_600_000;

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
    fetchEditalDocuments() {
      return Promise.resolve([]);
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

function makeService(connector: EditalSourceConnector, state: SyncState) {
  const ingestion = {
    ingest: jest.fn().mockResolvedValue({ outcome: 'created', isObra: true }),
  };
  const syncState = {
    getOrCreate: jest.fn().mockResolvedValue(state),
    markSynced: jest.fn().mockResolvedValue(undefined),
    recordError: jest.fn().mockResolvedValue(undefined),
  };
  const syncRun = { record: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn((_key: string, def: unknown) => def) };
  const service = new UfCaptureService(
    [connector],
    ingestion as unknown as EditalIngestionService,
    syncState as unknown as SyncStateService,
    syncRun as unknown as SyncRunService,
    config as unknown as ConfigService,
  );
  return { service, ingestion, syncState, syncRun };
}

describe('UfCaptureService.captureUf', () => {
  it('UF nova: backfill progressivo — passe rápido (7d) e completo (30d); marca só no fim', async () => {
    const { connector, queries } = makeConnector({
      records: [fakeRecord('a'), fakeRecord('b')],
    });
    const { service, ingestion, syncState, syncRun } = makeService(
      connector,
      buildState({ backfillDone: false }),
    );

    await service.captureUf('SC');

    // Dois passes: o rápido (janela pequena) antes do completo (30 dias).
    expect(queries).toHaveLength(2);
    expect(
      Math.round(
        (queries[0].dataFinal.getTime() - queries[0].dataInicial.getTime()) /
          DAY,
      ),
    ).toBe(7);
    expect(
      Math.round(
        (queries[1].dataFinal.getTime() - queries[1].dataInicial.getTime()) /
          DAY,
      ),
    ).toBe(30);
    // Ingere nos dois passes (2 registros cada) — dedup fica no upsert.
    expect(ingestion.ingest).toHaveBeenCalledTimes(4);
    // markSynced só uma vez, no passe completo (o rápido não marca).
    expect(syncState.markSynced).toHaveBeenCalledTimes(1);
    expect(syncState.markSynced).toHaveBeenCalledWith(
      EditalFonte.PNCP,
      'SC',
      expect.any(Date),
      { backfill: true },
    );
    // Só o passe autoritativo registra histórico (o rápido é best-effort).
    expect(syncRun.record).toHaveBeenCalledTimes(1);
    expect(syncRun.record).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'backfill',
        status: 'success',
        processed: 2,
      }),
    );
  });

  it('UF nova: falha no passe rápido não impede o completo (marca backfillDone)', async () => {
    // Conector que lança na 1ª chamada (passe rápido) e entrega na 2ª (completo).
    const queries: EditalQuery[] = [];
    let call = 0;
    const connector: EditalSourceConnector = {
      fonte: EditalFonte.PNCP,
      fetchEditais(query) {
        queries.push(query);
        const isFirst = call++ === 0;
        return (async function* () {
          if (isFirst) {
            throw new Error('rápido caiu');
          }
          yield fakeRecord('a');
        })();
      },
      fetchEditalDocuments() {
        return Promise.resolve([]);
      },
    };
    const { service, syncState, syncRun } = makeService(
      connector,
      buildState({ backfillDone: false }),
    );

    await service.captureUf('SC');

    expect(queries).toHaveLength(2);
    // O passe rápido best-effort não vira erro no histórico nem no sync_state.
    expect(syncState.recordError).not.toHaveBeenCalled();
    // O completo roda mesmo assim e marca o backfill.
    expect(syncState.markSynced).toHaveBeenCalledWith(
      EditalFonte.PNCP,
      'SC',
      expect.any(Date),
      { backfill: true },
    );
    expect(syncRun.record).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'backfill', status: 'success' }),
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

    await service.captureUf('SC');

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

  it('falha na fonte: registra erro e não propaga', async () => {
    const { connector } = makeConnector({ throws: true });
    const { service, syncState, syncRun } = makeService(
      connector,
      buildState(),
    );

    await expect(service.captureUf('SC')).resolves.toBeUndefined();
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

describe('UfCaptureService.triggerUfIfStale', () => {
  it('UF nova (sem backfill): dispara captura e retorna true', async () => {
    const { connector } = makeConnector({});
    const { service } = makeService(
      connector,
      buildState({ backfillDone: false }),
    );
    const captureSpy = jest
      .spyOn(service, 'captureUf')
      .mockResolvedValue(undefined);

    await expect(service.triggerUfIfStale('SC')).resolves.toBe(true);
    expect(captureSpy).toHaveBeenCalledWith('SC');
  });

  it('UF recém-sincronizada: não dispara e retorna false', async () => {
    const { connector } = makeConnector({});
    const { service } = makeService(
      connector,
      buildState({ backfillDone: true, syncedUntil: new Date() }),
    );
    const captureSpy = jest
      .spyOn(service, 'captureUf')
      .mockResolvedValue(undefined);

    await expect(service.triggerUfIfStale('SC')).resolves.toBe(false);
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('UF com watermark velho (> 24h): dispara de novo', async () => {
    const { connector } = makeConnector({});
    const { service } = makeService(
      connector,
      buildState({
        backfillDone: true,
        syncedUntil: new Date(Date.now() - 48 * HOUR),
      }),
    );
    const captureSpy = jest
      .spyOn(service, 'captureUf')
      .mockResolvedValue(undefined);

    await expect(service.triggerUfIfStale('SC')).resolves.toBe(true);
    expect(captureSpy).toHaveBeenCalledTimes(1);
  });

  it('dedup: chamadas concorrentes para a mesma UF disparam só uma captura', async () => {
    const { connector } = makeConnector({});
    const { service } = makeService(
      connector,
      buildState({ backfillDone: false }),
    );
    // captura pendente → a UF fica "em voo".
    const captureSpy = jest
      .spyOn(service, 'captureUf')
      .mockReturnValue(new Promise<void>(() => {}));

    const [a, b] = await Promise.all([
      service.triggerUfIfStale('SC'),
      service.triggerUfIfStale('SC'),
    ]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(captureSpy).toHaveBeenCalledTimes(1);
  });
});
