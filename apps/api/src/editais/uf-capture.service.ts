import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CAPTACAO_BACKFILL_DAYS_DEFAULT,
  CAPTACAO_ONDEMAND_QUICK_DAYS_DEFAULT,
  CAPTACAO_ONDEMAND_STALE_HOURS_DEFAULT,
  CAPTACAO_OVERLAP_DAYS_DEFAULT,
  CAPTACAO_RESYNC_DAYS_DEFAULT,
} from '../captacao/captacao.constants';
import { isUf, Uf } from '../common/uf';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from './connectors/edital-source-connector';
import { EditalSourceRecord } from './connectors/edital-source-record';
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

  // Re-sincroniza a situação/prazo dos editais de uma UF (T-114): consome o feed
  // de ATUALIZAÇÃO da fonte (por dataAtualizacao) numa janela fixa e reingere. O
  // upsert (hasChanged compara situação e prazo) atualiza os que mudaram —
  // anulado/revogado/suspenso passam a ser filtrados na busca/agenda/alertas.
  // Fontes sem `fetchAtualizacoes` são puladas. Não mexe no watermark de
  // publicação (é ortogonal ao incremental). Falha isolada por fonte.
  async resyncUf(uf: Uf): Promise<void> {
    for (const connector of this.connectors) {
      if (!connector.fetchAtualizacoes) {
        continue;
      }
      await this.runResync(connector, uf);
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

  // Sincroniza uma fonte numa UF. UF nova → backfill progressivo (T-98): um passe
  // rápido dos últimos dias (para os primeiros editais aparecerem já) seguido do
  // backfill completo, que é quem marca `backfillDone`. UF já com backfill →
  // incremental a partir do watermark. Falha isolada: o passe autoritativo
  // registra o erro e segue; nunca propaga.
  private async syncUf(
    connector: EditalSourceConnector,
    uf: Uf,
  ): Promise<void> {
    const state = await this.syncState.getOrCreate(connector.fonte, uf);
    const dataFinal = new Date();

    if (!state.backfillDone) {
      // Passe rápido: janela recente e pequena — não marca sync (o backfill
      // completo abaixo é o autoritativo). Best-effort: se falhar, segue.
      await this.runQuickPass(connector, uf, dataFinal);
      // Passe completo: janela cheia (re-busca a do rápido — upsert idempotente
      // por fonte+idExterno) e marca `backfillDone`.
      await this.runFullWindow(connector, uf, {
        dataInicial: this.daysAgo(dataFinal, this.backfillDays()),
        dataFinal,
        mode: 'backfill',
        markBackfill: true,
      });
      return;
    }

    await this.runFullWindow(connector, uf, {
      dataInicial: this.daysAgo(
        state.syncedUntil ?? dataFinal,
        this.overlapDays(),
      ),
      dataFinal,
      mode: 'incremental',
      markBackfill: false,
    });
  }

  // Loop de captação de uma janela: busca na fonte e ingere cada registro,
  // acumulando as contagens. Cada registro é ISOLADO (T-118a): um inválido
  // (data ilegível, UF fora das 27) ou que falhe ao gravar é pulado e contado,
  // não derruba a janela — senão a mesma linha ruim congelaria a UF pra sempre.
  // Erros do próprio fluxo de busca (paginação truncada, rede) ainda propagam.
  private ingestWindow(
    connector: EditalSourceConnector,
    uf: Uf,
    dataInicial: Date,
    dataFinal: Date,
  ): Promise<{
    processed: number;
    created: number;
    updated: number;
    obras: number;
    skipped: number;
  }> {
    return this.ingestSource(
      connector.fetchEditais({ uf, dataInicial, dataFinal }),
      connector.fonte,
      uf,
    );
  }

  // Núcleo compartilhado por ingestWindow (captação por publicação) e runResync
  // (re-sync por atualização, T-114): consome um fluxo de registros e ingere cada
  // um. Isolamento por registro (T-118a): um inválido/que falhe é pulado e
  // contado, não derruba o lote. Erros do próprio fluxo (paginação, rede) propagam.
  private async ingestSource(
    source: AsyncIterable<EditalSourceRecord>,
    fonte: EditalSourceConnector['fonte'],
    uf: Uf,
  ): Promise<{
    processed: number;
    created: number;
    updated: number;
    obras: number;
    skipped: number;
  }> {
    let processed = 0;
    let created = 0;
    let updated = 0;
    let obras = 0;
    let skipped = 0;
    for await (const record of source) {
      processed += 1;
      const motivo = this.registroInvalido(record);
      if (motivo) {
        skipped += 1;
        this.logger.warn(
          `${fonte}/${uf}: registro pulado (${motivo}) — ${record.idExterno}`,
        );
        continue;
      }
      try {
        const { outcome, isObra } = await this.ingestion.ingest(record);
        if (outcome === 'created') {
          created += 1;
        } else if (outcome === 'updated') {
          updated += 1;
        }
        if (isObra) {
          obras += 1;
        }
      } catch (caught) {
        skipped += 1;
        const message =
          caught instanceof Error ? caught.message : String(caught);
        this.logger.warn(
          `${fonte}/${uf}: falha ao ingerir ${record.idExterno} (pulado) — ${message}`,
        );
      }
    }
    return { processed, created, updated, obras, skipped };
  }

  // Motivo de o registro ser inválido (não persistível), ou null se está ok.
  // Campos NOT NULL sem conserto possível: idExterno, data de publicação e UF.
  private registroInvalido(record: EditalSourceRecord): string | null {
    if (!record.idExterno) return 'sem idExterno';
    if (
      !(record.dataPublicacao instanceof Date) ||
      isNaN(record.dataPublicacao.getTime())
    ) {
      return 'data de publicação inválida';
    }
    if (!isUf(record.uf)) return `UF inválida (${record.uf})`;
    return null;
  }

  // Passe rápido do backfill progressivo (T-98): busca só os últimos QUICK_DAYS
  // para os primeiros editais aparecerem na busca sem esperar o backfill inteiro.
  // Best-effort: NÃO marca sync nem registra erro/histórico — é o passe completo
  // (logo em seguida) que é autoritativo. Uma falha aqui só loga e segue.
  private async runQuickPass(
    connector: EditalSourceConnector,
    uf: Uf,
    dataFinal: Date,
  ): Promise<void> {
    const quickDays = this.quickDays();
    try {
      const r = await this.ingestWindow(
        connector,
        uf,
        this.daysAgo(dataFinal, quickDays),
        dataFinal,
      );
      this.logger.log(
        `${connector.fonte}/${uf} [backfill rápido ${quickDays}d]: ${r.processed} processados — ${r.created} novos, ${r.obras} obras${r.skipped ? `, ${r.skipped} pulados` : ''}.`,
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      this.logger.warn(
        `${connector.fonte}/${uf}: passe rápido falhou (segue pro completo) — ${message}`,
      );
    }
  }

  // Passe autoritativo (backfill completo ou incremental): ingere a janela, marca
  // o sync e sempre grava o histórico da execução (T-19), sucesso ou falha.
  private async runFullWindow(
    connector: EditalSourceConnector,
    uf: Uf,
    opts: {
      dataInicial: Date;
      dataFinal: Date;
      mode: 'backfill' | 'incremental';
      markBackfill: boolean;
    },
  ): Promise<void> {
    const startedAt = new Date();
    let counts = { processed: 0, created: 0, updated: 0, obras: 0, skipped: 0 };
    let status: 'success' | 'error' = 'success';
    let error: string | null = null;

    try {
      counts = await this.ingestWindow(
        connector,
        uf,
        opts.dataInicial,
        opts.dataFinal,
      );
      await this.syncState.markSynced(connector.fonte, uf, opts.dataFinal, {
        backfill: opts.markBackfill,
      });
      this.logger.log(
        `${connector.fonte}/${uf}${opts.markBackfill ? ' [backfill]' : ''}: ${counts.processed} processados — ${counts.created} novos, ${counts.updated} atualizados, ${counts.obras} obras${counts.skipped ? `, ${counts.skipped} pulados` : ''}.`,
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
        mode: opts.mode,
        status,
        ...counts,
        error,
        startedAt,
      });
    }
  }

  // Grava o histórico da execução — best-effort (não derruba a captação).
  // Passe de re-sync (T-114): reingere o feed de atualização de uma fonte numa
  // janela fixa de dataAtualizacao. Sempre grava o histórico (mode 'resync').
  // NÃO marca o watermark de publicação (ortogonal ao incremental) nem registra
  // erro no sync_state — uma falha aqui não deve travar a captação por publicação.
  private async runResync(
    connector: EditalSourceConnector,
    uf: Uf,
  ): Promise<void> {
    const dataFinal = new Date();
    const dias = this.resyncDays();
    const dataInicial = this.daysAgo(dataFinal, dias);
    const startedAt = new Date();
    let counts = { processed: 0, created: 0, updated: 0, obras: 0, skipped: 0 };
    let status: 'success' | 'error' = 'success';
    let error: string | null = null;

    try {
      counts = await this.ingestSource(
        connector.fetchAtualizacoes!({ uf, dataInicial, dataFinal }),
        connector.fonte,
        uf,
      );
      this.logger.log(
        `${connector.fonte}/${uf} [resync ${dias}d]: ${counts.processed} processados — ${counts.created} novos, ${counts.updated} atualizados, ${counts.obras} obras${counts.skipped ? `, ${counts.skipped} pulados` : ''}.`,
      );
    } catch (caught) {
      status = 'error';
      error = caught instanceof Error ? caught.message : String(caught);
      this.logger.error(`${connector.fonte}/${uf}: resync falhou — ${error}`);
    } finally {
      await this.recordRun({
        fonte: connector.fonte,
        uf,
        mode: 'resync',
        status,
        ...counts,
        error,
        startedAt,
      });
    }
  }

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

  private quickDays(): number {
    return Number(
      this.config.get(
        'CAPTACAO_ONDEMAND_QUICK_DAYS',
        CAPTACAO_ONDEMAND_QUICK_DAYS_DEFAULT,
      ),
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

  private resyncDays(): number {
    return Number(
      this.config.get('CAPTACAO_RESYNC_DAYS', CAPTACAO_RESYNC_DAYS_DEFAULT),
    );
  }
}
