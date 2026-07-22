import { Injectable } from '@nestjs/common';
import { IaCustoService } from '../editais/ia-custo.service';

export interface PainelIaCusto {
  hoje: number;
  mes: number;
  total: number;
  // Projeção de fechamento do mês (linear pelo ritmo até agora).
  projecaoMes: number;
  porFeatureMes: { exigenciasResumo: number; itens: number };
  porDia: { dia: string; total: number }[];
  tetos: { diarioUsd: number; mensalUsd: number };
}

// Medidor de custo de IA (T-190b, a tela). Reusa o IaCustoService (T-133) — o
// custo por edital JÁ é gravado e agregado. Custo por CONTA e hit rate de cache
// ficam para a T-190a (exigem instrumentar userId/cache-hit nas chamadas de IA).
@Injectable()
export class AdminIaCustoService {
  constructor(private readonly iaCusto: IaCustoService) {}

  async painel(now: Date = new Date()): Promise<PainelIaCusto> {
    const inicioMes = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [resumo, porFeatureMes, porDia] = await Promise.all([
      this.iaCusto.resumo(now),
      this.iaCusto.custoPorFeature(inicioMes),
      this.iaCusto.porDia(14, now),
    ]);

    return {
      hoje: resumo.hoje,
      mes: resumo.mes,
      total: resumo.total,
      projecaoMes: this.projetar(resumo.mes, now),
      porFeatureMes,
      porDia,
      tetos: this.iaCusto.tetos(),
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
