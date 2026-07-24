import { Injectable } from '@nestjs/common';
import { IaCustoService } from '../editais/ia-custo.service';
import {
  AdminAiUsageService,
  ContaIa,
  HitRate,
} from './admin-ai-usage.service';

export interface PainelIaCusto {
  hoje: number;
  mes: number;
  total: number;
  // Projeção de fechamento do mês (linear pelo ritmo até agora).
  projecaoMes: number;
  porFeatureMes: { exigenciasResumo: number; itens: number };
  porDia: { dia: string; total: number }[];
  tetos: { diarioUsd: number; mensalUsd: number };
  // Recortes que vêm do ai_usage (T-190a) — histórico mais curto que o resto do
  // painel, por isso `inicioHistorico` viaja junto.
  hitRateMes: HitRate;
  porContaMes: ContaIa[];
  inicioHistorico: Date | null;
}

// Medidor de custo de IA (T-190b + a leitura da T-190a). Duas fontes, de
// propósito:
//   • totais/projeção/por-dia vêm do IaCustoService (soma as tabelas de cache) —
//     histórico completo, é o que alimenta o teto da T-133;
//   • hit rate e custo por conta vêm do `ai_usage`, que só existe a partir de
//     24/07/2026.
// Misturar as duas num número só faria a tela mentir sobre o período coberto.
@Injectable()
export class AdminIaCustoService {
  constructor(
    private readonly iaCusto: IaCustoService,
    private readonly aiUsage: AdminAiUsageService,
  ) {}

  async painel(now: Date = new Date()): Promise<PainelIaCusto> {
    const inicioMes = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [
      resumo,
      porFeatureMes,
      porDia,
      hitRateMes,
      porContaMes,
      inicioHistorico,
    ] = await Promise.all([
      this.iaCusto.resumo(now),
      this.iaCusto.custoPorFeature(inicioMes),
      this.iaCusto.porDia(14, now),
      this.aiUsage.hitRate(inicioMes),
      this.aiUsage.porConta(inicioMes),
      this.aiUsage.inicioHistorico(),
    ]);

    return {
      hoje: resumo.hoje,
      mes: resumo.mes,
      total: resumo.total,
      projecaoMes: this.projetar(resumo.mes, now),
      porFeatureMes,
      porDia,
      tetos: this.iaCusto.tetos(),
      hitRateMes,
      porContaMes,
      inicioHistorico,
    };
  }

  // Projeção linear: gasto-até-agora / dia-do-mês × dias-no-mês.
  private projetar(gastoMes: number, now: Date): number {
    const diaDoMes = now.getUTCDate();
    const diasNoMes = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    if (diaDoMes <= 0) return gastoMes;
    return (gastoMes / diaDoMes) * diasNoMes;
  }
}
