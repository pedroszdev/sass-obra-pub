import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncRun } from '../editais/sync/sync-run.entity';
import { NotificationLog } from '../notificacoes/notification-log.entity';

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
// Mesma régua do /health/captacao: pipeline "vivo" = sucesso nas últimas 48h.
const SAUDAVEL_H = 48;

export interface CaptacaoSaude {
  ultimoSucessoEm: Date | null;
  horasDesde: number | null;
  saudavel: boolean;
}

export interface ExecucaoResumo {
  id: string;
  fonte: string;
  uf: string;
  mode: string;
  status: string;
  processed: number;
  created: number;
  obras: number;
  error: string | null;
  startedAt: Date;
  durationMs: number;
}

export interface AlertasDia {
  dia: string;
  total: number;
}

export interface PainelCaptacao {
  saude: CaptacaoSaude;
  porConector: ExecucaoResumo[];
  recentes: ExecucaoResumo[];
  alertasPorDia: AlertasDia[];
}

// Painel de captação e jobs (T-188). Só leitura — os disparos ficam no controller
// (auditados). "Vivo?" numa olhada: última captação com sucesso + últimas
// execuções + alertas enviados por dia.
@Injectable()
export class AdminCaptacaoService {
  constructor(
    @InjectRepository(SyncRun)
    private readonly syncRuns: Repository<SyncRun>,
    @InjectRepository(NotificationLog)
    private readonly notificacoes: Repository<NotificationLog>,
  ) {}

  async painel(now: Date = new Date()): Promise<PainelCaptacao> {
    const [ultimoSucesso, porConector, recentes, alertasPorDia] =
      await Promise.all([
        this.syncRuns.findOne({
          where: { status: 'success' },
          order: { finishedAt: 'DESC' },
        }),
        this.ultimaPorConector(),
        this.syncRuns.find({ order: { startedAt: 'DESC' }, take: 20 }),
        this.alertasPorDia(now),
      ]);

    const horasDesde = ultimoSucesso
      ? (now.getTime() - ultimoSucesso.finishedAt.getTime()) / HORA_MS
      : null;

    return {
      saude: {
        ultimoSucessoEm: ultimoSucesso?.finishedAt ?? null,
        horasDesde: horasDesde == null ? null : Math.floor(horasDesde),
        saudavel: horasDesde != null && horasDesde < SAUDAVEL_H,
      },
      porConector: porConector.map(resumo),
      recentes: recentes.map(resumo),
      alertasPorDia,
    };
  }

  // Última execução de cada fonte (DISTINCT ON no Postgres).
  private ultimaPorConector(): Promise<SyncRun[]> {
    return this.syncRuns
      .createQueryBuilder('r')
      .distinctOn(['r.fonte'])
      .orderBy('r.fonte', 'ASC')
      .addOrderBy('r.started_at', 'DESC')
      .getMany();
  }

  private async alertasPorDia(now: Date): Promise<AlertasDia[]> {
    const desde = new Date(now.getTime() - 7 * DIA_MS);
    const linhas = await this.notificacoes
      .createQueryBuilder('n')
      .select("to_char(date_trunc('day', n.sent_at), 'YYYY-MM-DD')", 'dia')
      .addSelect('COUNT(*)', 'total')
      .where('n.sent_at >= :desde', { desde })
      .groupBy('dia')
      .orderBy('dia', 'DESC')
      .getRawMany<{ dia: string; total: string }>();
    return linhas.map((l) => ({ dia: l.dia, total: Number(l.total) }));
  }
}

function resumo(r: SyncRun): ExecucaoResumo {
  return {
    id: r.id,
    fonte: r.fonte,
    uf: r.uf,
    mode: r.mode,
    status: r.status,
    processed: r.processed,
    created: r.created,
    obras: r.obras,
    error: r.error,
    startedAt: r.startedAt,
    durationMs: r.durationMs,
  };
}
