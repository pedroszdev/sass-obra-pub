import { describe, expect, it } from 'vitest';
import type { PrecosResponse } from '../types/auth';
import { diasRestantes, montarResumo } from './checkout';

// O resumo do checkout é dinheiro na tela: um número errado aqui é o cliente
// concordando com uma cobrança diferente da que vai acontecer.

const NOW = new Date('2026-08-03T12:00:00Z');
const dias = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const PRECOS: PrecosResponse = {
  mensal: { plano: 'mensal', valor: 14900, moeda: 'brl', priceId: 'preco_mensal' },
  anual: { plano: 'anual', valor: 149000, moeda: 'brl', priceId: 'preco_anual' },
  economiaAnual: 29800,
  mesesGratis: 2,
};

describe('montarResumo — sem trial (cobra hoje)', () => {
  it('mensal cobra o valor cheio hoje', () => {
    const r = montarResumo('mensal', PRECOS, null, NOW);
    expect(r.cobrancaHojeCentavos).toBe(14900);
    expect(r.primeiraCobranca).toBeNull();
    expect(r.mesesDoCiclo).toBe(1);
    expect(r.linhas).toEqual([{ rotulo: 'Plano mensal', valorCentavos: 14900 }]);
  });

  it('anual mostra o desconto, mas NÃO o soma', () => {
    // O `preco.valor` do anual já é o valor final. A linha de desconto explica
    // de onde vem o preço; somá-la cobraria duas vezes.
    const r = montarResumo('anual', PRECOS, null, NOW);
    expect(r.cobrancaHojeCentavos).toBe(149000);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[1]).toEqual({
      rotulo: 'Desconto anual (2 meses)',
      valorCentavos: -29800,
      destaque: 'desconto',
    });
  });

  it('sem economia a informar, a linha de desconto some', () => {
    const semEconomia = { ...PRECOS, economiaAnual: null, mesesGratis: null };
    const r = montarResumo('anual', semEconomia, null, NOW);
    expect(r.linhas).toHaveLength(1);
  });
});

describe('montarResumo — trial em andamento', () => {
  it('cobra R$ 0 hoje e adia a 1a cobrança para o fim do trial', () => {
    // 🔴 Espelha a `dataDaPrimeiraCobranca` do backend. Se divergirem, a tela
    // promete uma data e o provedor cobra noutra.
    const fim = dias(4);
    const r = montarResumo('anual', PRECOS, fim, NOW);
    expect(r.cobrancaHojeCentavos).toBe(0);
    expect(r.primeiraCobranca).toBe(fim);
    // O valor recorrente NÃO é zero — é ele que aparece no "Depois R$ X".
    expect(r.valorRecorrenteCentavos).toBe(149000);
  });

  it('a linha do teste conta os dias restantes', () => {
    const r = montarResumo('mensal', PRECOS, dias(4), NOW);
    expect(r.linhas.at(-1)).toEqual({
      rotulo: 'Teste grátis (4 dias)',
      valorCentavos: 0,
      destaque: 'gratis',
    });
  });

  it('singular quando falta 1 dia', () => {
    const r = montarResumo('mensal', PRECOS, dias(1), NOW);
    expect(r.linhas.at(-1)?.rotulo).toBe('Teste grátis (1 dia)');
  });

  it('trial já vencido cobra hoje, como se não houvesse trial', () => {
    const r = montarResumo('mensal', PRECOS, dias(-1), NOW);
    expect(r.cobrancaHojeCentavos).toBe(14900);
    expect(r.primeiraCobranca).toBeNull();
    expect(r.linhas.some((l) => l.rotulo.startsWith('Teste'))).toBe(false);
  });
});

describe('diasRestantes', () => {
  it('arredonda para CIMA — 6h restantes ainda é 1 dia', () => {
    expect(diasRestantes(new Date('2026-08-03T18:00:00Z'), NOW)).toBe(1);
  });

  it('passado e ausente valem zero', () => {
    expect(diasRestantes(dias(-1), NOW)).toBe(0);
    expect(diasRestantes(null, NOW)).toBe(0);
  });
});
