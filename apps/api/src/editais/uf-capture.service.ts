import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CAPTACAO_BACKFILL_DAYS_DEFAULT,
  CAPTACAO_ONDEMAND_STALE_HOURS_DEFAULT,
  CAPTACAO_OVERLAP_DAYS_DEFAULT,
} from '../captacao/captacao.constants';
import { Uf } from '../common/uf';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from './connectors/edital-source-connector';
import { EditalIngestionService } from './edital-ingestion.service';
import { SyncRunInput, SyncRunService } from './sync/sync-run.service';
import { SyncStateService } from './sync/sync-state.service';

// Captação de uma UF (backfill/incremental, ingestão e controle de sync) +
// o disparo "sob demanda" pela busca (T-34). Mora no EditaisModule para que a
// busca possa usá-lo sem criar dependência circular com o módulo da captação —
// o job (T-18) também passa a delegar aqui.
@Injectable()
export class UfCaptureService {
  private readonly logger = new Logger(UfCaptureService.name);
  // UFs com captura em andamento — dedup do disparo sob demanda (singleton).
  private readonly inFlight = new Set<string>();

  constructor(
    @Inject(EDITAL_SOURCE_CONNECTORS)
    private readonly connectors: EditalSourceConnector[],
    private readonly ingestion: EditalIngestionService,
    private readonly syncState: SyncStateService,
    private readonly syncRun: SyncRunService,
    private readonly config: ConfigService,
  ) {}

  // Capta uma UF em todas as fontes. Usado pelo job (todas as UFs de usuários) e
  // pelo disparo sob demanda (uma UF buscada). A pré-computação por IA (T-54) NÃO
  // mora aqui de propósito: ela é disparada SÓ pelo job (CaptacaoJobService), não
  // pela captação sob demanda da busca — assim a busca não gasta IA.
  async captureUf(uf: Uf): Promise<void> {
    for (const connector of this.connectors) {
      await this.syncUf(connector, uf);
    }
  }

  /**
   * Dispara a captação de `uf` em segundo plano SE ela estiver "velha" (UF nova
   * ou watermark antigo). Não espera a captura terminar. Retorna `true` quando há
   * uma captura ativa para a UF (a UI usa isso para sinalizar "buscando…").
   * Dedup por UF evita disparos concorrentes para a mesma região.
   */
  async triggerUfIfStale(uf: Uf): Promise<boolean> {
    if (this.inFlight.has(uf)) {
      return true;
    }
    // Reserva síncrona (antes de qualquer await) para não haver corrida entre
    // duas buscas simultâneas da mesma UF.
    this.inFlight.add(uf);

    let stale: boolean;
    try {
      stale = await this.isStale(uf);
    } catch (caught) {
      this.inFlight.delete(uf);
      const message = caught instanceof Error ? caught.message : String(caught);
      this.logger.warn(`Não foi possível checar o estado de ${uf}: ${message}`);
      return false;
    }

    if (!stale) {
      this.inFlight.delete(uf);
      return false;
    }

    this.logger.log(`Captação sob demanda disparada para ${uf}.`);
    void this.captureUf(uf)
      .catch((caught: unknown) => {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        this.logger.error(`Captação sob demanda de ${uf} falhou: ${message}`);
      })
      .finally(() => {
        this.inFlight.delete(uf);
      });
    return true;
  }

  // "Velha" = alguma fonte ainda não fez backfill da UF, ou o watermark passou
  // do limite de horas. getOrCreate marca a UF como conhecida no controle de sync.
  private async isStale(uf: Uf): Promise<boolean> {
    const maxAgeMs = this.staleHours() * 3_600_000;
    for (const connector of this.connectors) {
      const state = await this.syncState.getOrCreate(connector.fonte, uf);
      if (!state.backfillDone) {
        return true;
      }
      const until = state.syncedUntil ? state.syncedUntil.getTime() : 0;
      if (Date.now() - until > maxAgeMs) {
        return true;
      }
    }
    return false;
  }

  // Sincroniza uma fonte numa UF. Falha isolada: registra o erro e segue.
  // Sempre grava o histórico da execução (T-19), sucesso ou falha.
  private async syncUf(
    connector: EditalSourceConnector,
    uf: Uf,
  ): Promise<void> {
    const state = await this.syncState.getOrCreate(connector.fonte, uf);
    const isBackfill = !state.backfillDone;
    const mode = isBackfill ? 'backfill' : 'incremental';
    const startedAt = new Date();
    const dataFinal = startedAt;
    const dataInicial = isBackfill
      ? this.daysAgo(dataFinal, this.backfillDays())
      : this.daysAgo(state.syncedUntil ?? dataFinal, this.overlapDays());

    let processed = 0;
    let created = 0;
    let updated = 0;
    let obras = 0;
    let status: 'success' | 'error' = 'success';
    let error: string | null = null;

    try {
      for await (const record of connector.fetchEditais({
        uf,
        dataInicial,
        dataFinal,
      })) {
        const { outcome, isObra } = await this.ingestion.ingest(record);
        processed += 1;
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
        `${connector.fonte}/${uf}${isBackfill ? ' [backfill]' : ''}: ${processed} processados — ${created} novos, ${updated} atualizados, ${obras} obras.`,
      );
    } catch (caught) {
      status = 'error';
      error = caught instanceof Error ? caught.message : String(caught);
      await this.syncState.recordError(connector.fonte, uf, error);
      this.logger.error(`${connector.fonte}/${uf}: falhou — ${error}`);
    } finally {
      await this.recordRun({
        fonte: connector.fonte,
        uf,
        mode,
        status,
        processed,
        created,
        updated,
        obras,
        error,
        startedAt,
      });
    }
  }

  // Grava o histórico da execução — best-effort (não derruba a captação).
  private async recordRun(
    input: Omit<SyncRunInput, 'finishedAt' | 'durationMs'>,
  ): Promise<void> {
    try {
      const finishedAt = new Date();
      await this.syncRun.record({
        ...input,
        finishedAt,
        durationMs: finishedAt.getTime() - input.startedAt.getTime(),
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      this.logger.warn(`Falha ao registrar histórico de sync: ${message}`);
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

  private staleHours(): number {
    return Number(
      this.config.get(
        'CAPTACAO_ONDEMAND_STALE_HOURS',
        CAPTACAO_ONDEMAND_STALE_HOURS_DEFAULT,
      ),
    );
  }
}
