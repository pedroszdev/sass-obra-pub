import { AdminIaCustoService } from '../src/admin/admin-ia-custo.service';
import { IaCustoService } from '../src/editais/ia-custo.service';

// Tela de custo de IA (T-190b). O que importa: a projeção linear e a montagem do
// painel a partir do IaCustoService (que já agrega o custo, T-133).

function build() {
  const iaCusto = {
    resumo: jest.fn().mockResolvedValue({
      hoje: 2,
      mes: 10,
      total: 100,
      exigenciasUsd: 60,
      itensUsd: 40,
    }),
    custoPorFeature: jest
      .fn()
      .mockResolvedValue({ exigenciasResumo: 7, itens: 3 }),
    porDia: jest.fn().mockResolvedValue([{ dia: '2026-07-08', total: 2 }]),
    tetos: jest.fn().mockReturnValue({ diarioUsd: 5, mensalUsd: 100 }),
  } as unknown as IaCustoService;
  return { service: new AdminIaCustoService(iaCusto), iaCusto };
}

describe('AdminIaCustoService.painel (T-190b)', () => {
  it('projeta o mês linearmente (gasto/dia × dias no mês)', async () => {
    // 8 de julho (31 dias): 10 / 8 × 31 = 38.75.
    const p = await build().service.painel(new Date('2026-07-08T12:00:00Z'));
    expect(p.projecaoMes).toBeCloseTo(38.75, 2);
    expect(p.mes).toBe(10);
    expect(p.hoje).toBe(2);
    expect(p.porFeatureMes).toEqual({ exigenciasResumo: 7, itens: 3 });
    expect(p.tetos).toEqual({ diarioUsd: 5, mensalUsd: 100 });
  });

  it('projeção no dia 1 = gasto do dia (sem dividir por zero)', async () => {
    const p = await build().service.painel(new Date('2026-07-01T00:00:00Z'));
    // 10 / 1 × 31 = 310.
    expect(p.projecaoMes).toBeCloseTo(310, 2);
  });
});
