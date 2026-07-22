import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ObjectLiteral } from 'typeorm';
import { EditalExigencias } from './exigencias/edital-exigencias.entity';
import { EditalItensExtracao } from './itens/edital-itens-extracao.entity';

// Custo de IA em produção (BACKLOG T-133). §3.4 manda registrar tokens+custo por
// chamada — as duas tabelas de extração (exigências e itens) já têm `custo_usd`.
// Aqui: (a) agrega esse gasto por período e (b) um teto (circuit-breaker) que
// pausa os gatilhos de IA antes da fatura da OpenAI fugir (dívida §10.8).

export interface IaCustoResumo {
  /** USD gasto no dia corrente (UTC). */
  hoje: number;
  /** USD gasto no mês corrente (UTC). */
  mes: number;
  /** USD gasto desde sempre. */
  total: number;
  exigenciasUsd: number;
  itensUsd: number;
}

function inicioDoDiaUtc(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
function inicioDoMesUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

@Injectable()
export class IaCustoService {
  private readonly logger = new Logger(IaCustoService.name);

  constructor(
    @InjectRepository(EditalExigencias)
    private readonly exigencias: Repository<EditalExigencias>,
    @InjectRepository(EditalItensExtracao)
    private readonly itens: Repository<EditalItensExtracao>,
    private readonly config: ConfigService,
  ) {}

  // Soma custo_usd de uma tabela desde `inicio` (por updated_at). Sem `inicio` =
  // desde sempre. SUM sobre numeric volta string → Number.
  private async somar(
    repo: Repository<ObjectLiteral>,
    inicio?: Date,
  ): Promise<number> {
    const qb = repo
      .createQueryBuilder('x')
      .select('COALESCE(SUM(x.custo_usd), 0)', 'total');
    if (inicio) qb.where('x.updated_at >= :inicio', { inicio });
    const row = await qb.getRawOne<{ total: string }>();
    return Number(row?.total ?? 0) || 0;
  }

  // Gasto total (exigências + itens) desde `inicio`.
  async gastoDesde(inicio?: Date): Promise<number> {
    const [a, b] = await Promise.all([
      this.somar(this.exigencias, inicio),
      this.somar(this.itens, inicio),
    ]);
    return a + b;
  }

  // Custo por FEATURE desde `inicio` (T-190): resumo+exigências saem da mesma
  // chamada (edital_exigencias), então formam um bucket; itens da planilha, outro.
  async custoPorFeature(
    inicio?: Date,
  ): Promise<{ exigenciasResumo: number; itens: number }> {
    const [exigenciasResumo, itens] = await Promise.all([
      this.somar(this.exigencias, inicio),
      this.somar(this.itens, inicio),
    ]);
    return { exigenciasResumo, itens };
  }

  // Custo por dia (UTC) nos últimos `dias`, somando as duas tabelas (T-190).
  async porDia(
    dias: number,
    now: Date = new Date(),
  ): Promise<{ dia: string; total: number }[]> {
    const desde = new Date(
      inicioDoDiaUtc(now).getTime() - (dias - 1) * 24 * 60 * 60 * 1000,
    );
    const [a, b] = await Promise.all([
      this.porDiaDe(this.exigencias, desde),
      this.porDiaDe(this.itens, desde),
    ]);
    const mapa = new Map<string, number>();
    for (const { dia, total } of [...a, ...b]) {
      mapa.set(dia, (mapa.get(dia) ?? 0) + total);
    }
    return [...mapa.entries()]
      .map(([dia, total]) => ({ dia, total }))
      .sort((x, y) => (x.dia < y.dia ? -1 : 1));
  }

  private async porDiaDe(
    repo: Repository<ObjectLiteral>,
    desde: Date,
  ): Promise<{ dia: string; total: number }[]> {
    const linhas = await repo
      .createQueryBuilder('x')
      .select("to_char(date_trunc('day', x.updated_at), 'YYYY-MM-DD')", 'dia')
      .addSelect('COALESCE(SUM(x.custo_usd), 0)', 'total')
      .where('x.updated_at >= :desde', { desde })
      .groupBy('dia')
      .getRawMany<{ dia: string; total: string }>();
    return linhas.map((l) => ({ dia: l.dia, total: Number(l.total) || 0 }));
  }

  // Tetos configurados (USD; 0 = sem teto). Para a tela mostrar "% do teto".
  tetos(): { diarioUsd: number; mensalUsd: number } {
    return {
      diarioUsd: this.teto('IA_BUDGET_DAILY_USD'),
      mensalUsd: this.teto('IA_BUDGET_MONTHLY_USD'),
    };
  }

  async resumo(now: Date = new Date()): Promise<IaCustoResumo> {
    const [hoje, mes, exigenciasUsd, itensUsd] = await Promise.all([
      this.gastoDesde(inicioDoDiaUtc(now)),
      this.gastoDesde(inicioDoMesUtc(now)),
      this.somar(this.exigencias),
      this.somar(this.itens),
    ]);
    return {
      hoje,
      mes,
      total: exigenciasUsd + itensUsd,
      exigenciasUsd,
      itensUsd,
    };
  }

  // Tetos por env (USD). Ausente/0/negativo = SEM teto (desligado por padrão —
  // não altera o comportamento atual; o dono liga em prod). Ver CLAUDE.md §8.
  private teto(chave: string): number {
    const v = Number(this.config.get(chave, 0));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  // false quando um dos tetos configurados já foi atingido no período.
  async dentroDoOrcamento(now: Date = new Date()): Promise<boolean> {
    const diario = this.teto('IA_BUDGET_DAILY_USD');
    const mensal = this.teto('IA_BUDGET_MONTHLY_USD');
    if (diario <= 0 && mensal <= 0) return true; // sem teto configurado
    if (diario > 0 && (await this.gastoDesde(inicioDoDiaUtc(now))) >= diario) {
      return false;
    }
    if (mensal > 0 && (await this.gastoDesde(inicioDoMesUtc(now))) >= mensal) {
      return false;
    }
    return true;
  }

  // Circuit-breaker para os gatilhos de IA on-demand: 503 se o teto estourou.
  async assertDentroDoOrcamento(now: Date = new Date()): Promise<void> {
    if (!(await this.dentroDoOrcamento(now))) {
      this.logger.warn(
        'Orçamento de IA do período atingido — gatilho de IA bloqueado (T-133).',
      );
      throw new ServiceUnavailableException(
        'Orçamento de IA do período atingido. Tente novamente mais tarde.',
      );
    }
  }
}
