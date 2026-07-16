import { describe, expect, it } from 'vitest';
import { progressoTrial, rotuloTrial, trialUrgente } from './trial';

describe('rotuloTrial', () => {
  it('pluraliza os dias', () => {
    expect(rotuloTrial(7)).toBe('7 dias');
    expect(rotuloTrial(2)).toBe('2 dias');
  });

  // "1 dias" é o tipo de detalhe que faz o produto parecer amador.
  it('trata o último dia como caso próprio', () => {
    expect(rotuloTrial(1)).toBe('Último dia');
  });

  it('encerrado quando não há mais dias', () => {
    expect(rotuloTrial(0)).toBe('Encerrado');
    expect(rotuloTrial(-1)).toBe('Encerrado');
  });
});

describe('trialUrgente', () => {
  it('vira urgência nos últimos 3 dias', () => {
    expect(trialUrgente(4)).toBe(false);
    expect(trialUrgente(3)).toBe(true);
    expect(trialUrgente(1)).toBe(true);
  });
});

describe('progressoTrial', () => {
  const INICIO = '2026-07-12T12:00:00Z';
  const FIM = '2026-07-19T12:00:00Z';

  it('mede o quanto do teste já passou', () => {
    expect(progressoTrial(INICIO, FIM, new Date(INICIO))).toBe(0);
    expect(progressoTrial(INICIO, FIM, new Date('2026-07-15T12:00:00Z'))).toBeCloseTo(
      42.86,
      1,
    );
    expect(progressoTrial(INICIO, FIM, new Date(FIM))).toBe(100);
  });

  it('nunca passa de 100 nem cai abaixo de 0', () => {
    expect(progressoTrial(INICIO, FIM, new Date('2026-08-01T12:00:00Z'))).toBe(100);
    expect(progressoTrial(INICIO, FIM, new Date('2026-07-01T12:00:00Z'))).toBe(0);
  });

  // Barra vazia é honesta; barra cheia por erro de conta diria "seu teste
  // acabou" a quem ainda tem dias.
  it('datas ausentes ou incoerentes → 0, não 100', () => {
    expect(progressoTrial(null, FIM)).toBe(0);
    expect(progressoTrial(INICIO, null)).toBe(0);
    expect(progressoTrial(FIM, INICIO, new Date(FIM))).toBe(0);
    expect(progressoTrial('não é data', FIM)).toBe(0);
  });
});
