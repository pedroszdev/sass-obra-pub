import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EditalExigencias } from '../src/editais/exigencias/edital-exigencias.entity';
import { EditalItensExtracao } from '../src/editais/itens/edital-itens-extracao.entity';
import { IaCustoService } from '../src/editais/ia-custo.service';

// Repo fake cujo QueryBuilder resolve o SUM configurado por chamada.
function repoComSomas(somas: number[]) {
  let i = 0;
  const qb: { select: jest.Mock; where: jest.Mock; getRawOne: jest.Mock } = {
    select: jest.fn(),
    where: jest.fn(),
    getRawOne: jest.fn(() =>
      Promise.resolve({ total: String(somas[i++] ?? 0) }),
    ),
  };
  qb.select.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  return { createQueryBuilder: jest.fn(() => qb) };
}

const NOW = new Date('2026-07-08T12:00:00Z');

function build(
  exigSomas: number[],
  itensSomas: number[],
  env: Record<string, string> = {},
) {
  const exig = repoComSomas(exigSomas);
  const itens = repoComSomas(itensSomas);
  const config = {
    get: jest.fn((k: string, def: unknown) => env[k] ?? def),
  };
  const service = new IaCustoService(
    exig as unknown as Repository<EditalExigencias>,
    itens as unknown as Repository<EditalItensExtracao>,
    config as unknown as ConfigService,
  );
  return { service, exig, itens };
}

describe('IaCustoService (T-133)', () => {
  it('resumo soma as duas tabelas (hoje/mês/total)', async () => {
    // ordem das chamadas em resumo(): gastoDesde(dia) → exig, itens;
    // gastoDesde(mês) → exig, itens; somar(exig total); somar(itens total).
    const { service } = build([1, 3, 10], [2, 4, 20]);
    const r = await service.resumo(NOW);
    expect(r.hoje).toBe(3); // 1 + 2
    expect(r.mes).toBe(7); // 3 + 4
    expect(r.exigenciasUsd).toBe(10);
    expect(r.itensUsd).toBe(20);
    expect(r.total).toBe(30);
  });

  it('sem teto configurado → dentroDoOrcamento sempre true', async () => {
    const { service } = build([999], [999]);
    expect(await service.dentroDoOrcamento(NOW)).toBe(true);
  });

  it('teto diário estourado → false', async () => {
    // gastoDesde(dia): exig=6, itens=0 → 6 ≥ 5.
    const { service } = build([6], [0], { IA_BUDGET_DAILY_USD: '5' });
    expect(await service.dentroDoOrcamento(NOW)).toBe(false);
  });

  it('teto diário não estourado → true', async () => {
    const { service } = build([2], [1], { IA_BUDGET_DAILY_USD: '5' });
    expect(await service.dentroDoOrcamento(NOW)).toBe(true);
  });

  it('teto mensal estourado → false (mesmo com dia ok)', async () => {
    // diário (não setado) pulado; mensal: exig=50,itens=0 → 50 ≥ 40.
    const { service } = build([50], [0], { IA_BUDGET_MONTHLY_USD: '40' });
    expect(await service.dentroDoOrcamento(NOW)).toBe(false);
  });

  it('assertDentroDoOrcamento lança 503 quando estourou', async () => {
    const { service } = build([6], [0], { IA_BUDGET_DAILY_USD: '5' });
    await expect(service.assertDentroDoOrcamento(NOW)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('assertDentroDoOrcamento não lança quando dentro', async () => {
    const { service } = build([0], [0], { IA_BUDGET_DAILY_USD: '5' });
    await expect(service.assertDentroDoOrcamento(NOW)).resolves.toBeUndefined();
  });

  // Alertas de teto (T-190): entrada do e-mail de aviso/pausa ao dono.
  describe('alertasDeTeto (T-190)', () => {
    it('sem teto configurado → lista vazia', async () => {
      const { service } = build([999], [999]);
      expect(await service.alertasDeTeto(NOW)).toEqual([]);
    });

    it('teto diário atingido (≥100%) → nivel atingido', async () => {
      // gastoDesde(dia): exig=6, itens=0 → 6/5 = 1.2
      const { service } = build([6], [0], { IA_BUDGET_DAILY_USD: '5' });
      const r = await service.alertasDeTeto(NOW);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ periodo: 'diario', nivel: 'atingido' });
    });

    it('gasto entre 80% e 100% → nivel aviso', async () => {
      // gastoDesde(dia): exig=8.5 → 8.5/10 = 0.85
      const { service } = build([8.5], [0], { IA_BUDGET_DAILY_USD: '10' });
      const r = await service.alertasDeTeto(NOW);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ periodo: 'diario', nivel: 'aviso' });
    });

    it('gasto abaixo de 80% do teto → nada', async () => {
      const { service } = build([5], [0], { IA_BUDGET_DAILY_USD: '10' });
      expect(await service.alertasDeTeto(NOW)).toEqual([]);
    });

    it('só o teto mensal setado → alerta mensal', async () => {
      const { service } = build([50], [0], { IA_BUDGET_MONTHLY_USD: '40' });
      const r = await service.alertasDeTeto(NOW);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ periodo: 'mensal', nivel: 'atingido' });
    });
  });
});
