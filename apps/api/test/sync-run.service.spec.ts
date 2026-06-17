import { Repository } from 'typeorm';
import { SyncRun } from '../src/editais/sync/sync-run.entity';
import {
  SyncRunInput,
  SyncRunService,
} from '../src/editais/sync/sync-run.service';
import { EditalFonte } from '../src/editais/edital-fonte.enum';

const input: SyncRunInput = {
  fonte: EditalFonte.PNCP,
  uf: 'SC',
  mode: 'backfill',
  status: 'success',
  processed: 10,
  created: 7,
  updated: 3,
  obras: 6,
  error: null,
  startedAt: new Date('2026-06-16T03:00:00Z'),
  finishedAt: new Date('2026-06-16T03:00:05Z'),
  durationMs: 5000,
};

describe('SyncRunService', () => {
  it('cria e salva o registro de execução', async () => {
    const repo = {
      create: jest.fn((data: SyncRunInput) => data as SyncRun),
      save: jest.fn((entity: SyncRun) => Promise.resolve(entity)),
    };
    const service = new SyncRunService(repo as unknown as Repository<SyncRun>);

    await service.record(input);

    expect(repo.create).toHaveBeenCalledWith(input);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});
