import { describe, expect, it } from 'vitest';
import { BDI_MAX, clampBdi, naoNegativo } from './orcamento';

describe('clampBdi (T-166: negativo nunca vira 400)', () => {
  it('clampa o negativo para 0 em vez de deixar ir para a API', () => {
    expect(clampBdi(-50)).toBe(0);
    expect(clampBdi(-0.01)).toBe(0);
  });

  it('clampa acima do teto para 999.99', () => {
    expect(clampBdi(5000)).toBe(BDI_MAX);
    expect(clampBdi(1000)).toBe(BDI_MAX);
  });

  it('preserva um valor válido', () => {
    expect(clampBdi(25)).toBe(25);
    expect(clampBdi(0)).toBe(0);
    expect(clampBdi(999.99)).toBe(999.99);
  });

  it('arredonda para 2 casas (backend exige maxDecimalPlaces: 2)', () => {
    expect(clampBdi(12.345)).toBe(12.35);
    expect(clampBdi(12.344)).toBe(12.34);
  });

  it('entrada não finita (NaN/Infinity) vira 0, não NaN', () => {
    expect(clampBdi(Number.NaN)).toBe(0);
    expect(clampBdi(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('naoNegativo (preço/quantidade)', () => {
  it('clampa negativo para 0', () => {
    expect(naoNegativo(-3)).toBe(0);
  });

  it('preserva positivo e zero', () => {
    expect(naoNegativo(10)).toBe(10);
    expect(naoNegativo(0)).toBe(0);
  });

  it('preserva null (campo vazio, não é zero)', () => {
    expect(naoNegativo(null)).toBeNull();
  });
});
