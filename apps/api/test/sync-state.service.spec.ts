import { Repository } from 'typeorm';
import { SyncState } from '../src/editais/sync/sync-state.entity';
import { SyncStateService } from '../src/editais/sync/sync-state.service';
import { EditalFonte } from '../src/editais/edital-fonte.enum';

const buildState = (overrides: Partial<SyncState> = {}): SyncState =>
  ({
    id: 's1',
    fonte: EditalFonte.PNCP,
    uf: 'SC',
    backfillDone: false,
    syncedUntil: null,
    lastRunAt: null,
    lastError: null,
    lastErrorAt: null,
    consecutiveErrors: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as SyncState;

describe('SyncStateService', () => {
  let service: SyncStateService;
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((data: Partial<SyncState>) => buildState(data)),
      save: jest.fn((entity: SyncState) => Promise.resolve(entity)),
    };
    service = new SyncStateService(repo as unknown as Repository<SyncState>);
  });

  describe('getOrCreate', () => {
    it('devolve o registro existente sem criar', async () => {
      const existente = buildState();
      repo.findOne.mockResolvedValue(existente);

      await expect(service.getOrCreate(EditalFonte.PNCP, 'SC')).resolves.toBe(
        existente,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('cria um registro zerado quando não existe', async () => {
      repo.findOne.mockResolvedValue(null);

      const state = await service.getOrCreate(EditalFonte.PNCP, 'SC');

      expect(repo.create).toHaveBeenCalledWith({
        fonte: EditalFonte.PNCP,
        uf: 'SC',
        backfillDone: false,
        consecutiveErrors: 0,
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(state.backfillDone).toBe(false);
    });
  });

  describe('markSynced', () => {
    it('grava o watermark, marca backfill e zera o erro', async () => {
      const state = buildState({ consecutiveErrors: 3, lastError: 'falha' });
      repo.findOne.mockResolvedValue(state);
      const until = new Date('2026-06-16T00:00:00Z');

      await service.markSynced(EditalFonte.PNCP, 'SC', until, {
        backfill: true,
      });

      expect(state.syncedUntil).toBe(until);
      expect(state.backfillDone).toBe(true);
      expect(state.lastError).toBeNull();
      expect(state.lastErrorAt).toBeNull();
      expect(state.consecutiveErrors).toBe(0);
      expect(repo.save).toHaveBeenCalledWith(state);
    });

    it('sem a flag backfill não altera backfillDone', async () => {
      const state = buildState({ backfillDone: true });
      repo.findOne.mockResolvedValue(state);

      await service.markSynced(EditalFonte.PNCP, 'SC', new Date());

      expect(state.backfillDone).toBe(true);
    });

    it('T-118c: não regride o watermark (só avança)', async () => {
      const jaSincronizado = new Date('2026-06-20T00:00:00Z');
      const state = buildState({ syncedUntil: jaSincronizado });
      repo.findOne.mockResolvedValue(state);

      // Gravação atrasada com um `until` anterior não pode recuar o watermark.
      await service.markSynced(
        EditalFonte.PNCP,
        'SC',
        new Date('2026-06-10T00:00:00Z'),
      );

      expect(state.syncedUntil).toBe(jaSincronizado);
    });

    it('T-118c: avança o watermark quando o until é mais recente', async () => {
      const state = buildState({
        syncedUntil: new Date('2026-06-10T00:00:00Z'),
      });
      repo.findOne.mockResolvedValue(state);
      const maisNovo = new Date('2026-06-20T00:00:00Z');

      await service.markSynced(EditalFonte.PNCP, 'SC', maisNovo);

      expect(state.syncedUntil).toBe(maisNovo);
    });
  });

  describe('recordError', () => {
    it('grava o erro e incrementa o contador de falhas', async () => {
      const state = buildState({ consecutiveErrors: 1 });
      repo.findOne.mockResolvedValue(state);

      await service.recordError(EditalFonte.PNCP, 'SC', 'timeout');

      expect(state.lastError).toBe('timeout');
      expect(state.lastErrorAt).toBeInstanceOf(Date);
      expect(state.consecutiveErrors).toBe(2);
      expect(repo.save).toHaveBeenCalledWith(state);
    });
  });
});
