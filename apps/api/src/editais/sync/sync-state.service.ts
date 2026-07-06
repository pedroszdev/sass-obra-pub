import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Uf } from '../../common/uf';
import { EditalFonte } from '../edital-fonte.enum';
import { SyncState } from './sync-state.entity';

// Registra e lê "até onde sincronizamos a fonte X na UF Y". É o que o job
// (T-18) consulta para escolher backfill vs incremental e continuar de onde parou.
@Injectable()
export class SyncStateService {
  constructor(
    @InjectRepository(SyncState)
    private readonly repo: Repository<SyncState>,
  ) {}

  // Lê o estado de (fonte, uf), criando um registro zerado se não existir.
  async getOrCreate(fonte: EditalFonte, uf: Uf): Promise<SyncState> {
    const existing = await this.repo.findOne({ where: { fonte, uf } });
    if (existing) {
      return existing;
    }
    return this.repo.save(
      this.repo.create({
        fonte,
        uf,
        backfillDone: false,
        consecutiveErrors: 0,
      }),
    );
  }

  // Marca uma sincronização bem-sucedida até `until` (watermark) e zera o erro.
  async markSynced(
    fonte: EditalFonte,
    uf: Uf,
    until: Date,
    options: { backfill?: boolean } = {},
  ): Promise<void> {
    const state = await this.getOrCreate(fonte, uf);
    // Só AVANÇA o watermark — nunca regride (T-118c): duas sincronizações
    // concorrentes (cron × manual × busca) fazem read-modify-write, e uma
    // gravação atrasada poderia recuar o watermark e re-buscar dado já captado.
    if (!state.syncedUntil || until > state.syncedUntil) {
      state.syncedUntil = until;
    }
    state.lastRunAt = new Date();
    if (options.backfill) {
      state.backfillDone = true;
    }
    state.lastError = null;
    state.lastErrorAt = null;
    state.consecutiveErrors = 0;
    await this.repo.save(state);
  }

  // Registra uma falha de sincronização (saúde/monitoramento — T-19).
  async recordError(
    fonte: EditalFonte,
    uf: Uf,
    message: string,
  ): Promise<void> {
    const state = await this.getOrCreate(fonte, uf);
    const now = new Date();
    state.lastRunAt = now;
    state.lastError = message;
    state.lastErrorAt = now;
    state.consecutiveErrors += 1;
    await this.repo.save(state);
  }
}
