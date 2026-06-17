import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Uf } from '../common/uf';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from '../editais/connectors/edital-source-connector';
import { EditalIngestionService } from '../editais/edital-ingestion.service';
import { SyncStateService } from '../editais/sync/sync-state.service';
import { UsersService } from '../users/users.service';
import {
  CAPTACAO_BACKFILL_DAYS_DEFAULT,
  CAPTACAO_OVERLAP_DAYS_DEFAULT,
} from './captacao.constants';

// Maestro da captação. Lê as UFs dos usuários ativos e, para cada conector × UF,
// roda backfill (UF nova) ou incremental (a partir do watermark), ingere os
// editais e atualiza o controle de sync. O conector continua sem conhecer "usuário".
@Injectable()
export class CaptacaoJobService {
  private readonly logger = new Logger(CaptacaoJobService.name);

  constructor(
    @Inject(EDITAL_SOURCE_CONNECTORS)
    private readonly connectors: EditalSourceConnector[],
    private readonly ingestion: EditalIngestionService,
    private readonly syncState: SyncStateService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledSync(): Promise<void> {
    await this.runOnce();
  }

  // Um ciclo completo de captação. Público para permitir disparo manual (teste/ops).
  async runOnce(): Promise<void> {
    const ufs = await this.users.findDistinctUfs();
    if (ufs.length === 0) {
      this.logger.log('Nenhuma UF ativa (sem usuários com UF). Nada a captar.');
      return;
    }
    this.logger.log(
      `Captação iniciada: ${this.connectors.length} fonte(s) × ${ufs.length} UF(s).`,
    );
    for (const connector of this.connectors) {
      for (const uf of ufs) {
        await this.syncUf(connector, uf);
      }
    }
    this.logger.log('Captação finalizada.');
  }

  // Sincroniza uma fonte numa UF. Falha isolada: registra o erro e segue adiante.
  private async syncUf(
    connector: EditalSourceConnector,
    uf: Uf,
  ): Promise<void> {
    const state = await this.syncState.getOrCreate(connector.fonte, uf);
    const isBackfill = !state.backfillDone;
    const dataFinal = new Date();
    const dataInicial = isBackfill
      ? this.daysAgo(dataFinal, this.backfillDays())
      : this.daysAgo(state.syncedUntil ?? dataFinal, this.overlapDays());

    try {
      let total = 0;
      let created = 0;
      let updated = 0;
      let obras = 0;
      for await (const record of connector.fetchEditais({
        uf,
        dataInicial,
        dataFinal,
      })) {
        const { outcome, isObra } = await this.ingestion.ingest(record);
        total += 1;
        if (outcome === 'created') {
          created += 1;
        } else if (outcome === 'updated') {
          updated += 1;
        }
        if (isObra) {
          obras += 1;
        }
      }
      await this.syncState.markSynced(connector.fonte, uf, dataFinal, {
        backfill: isBackfill,
      });
      this.logger.log(
        `${connector.fonte}/${uf}${isBackfill ? ' [backfill]' : ''}: ${total} processados — ${created} novos, ${updated} atualizados, ${obras} obras.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.syncState.recordError(connector.fonte, uf, message);
      this.logger.error(`${connector.fonte}/${uf}: falhou — ${message}`);
    }
  }

  private daysAgo(from: Date, days: number): Date {
    const date = new Date(from);
    date.setDate(date.getDate() - days);
    return date;
  }

  private backfillDays(): number {
    return Number(
      this.config.get('CAPTACAO_BACKFILL_DAYS', CAPTACAO_BACKFILL_DAYS_DEFAULT),
    );
  }

  private overlapDays(): number {
    return Number(
      this.config.get('CAPTACAO_OVERLAP_DAYS', CAPTACAO_OVERLAP_DAYS_DEFAULT),
    );
  }
}
