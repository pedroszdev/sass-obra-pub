import { describe, expect, it } from 'vitest';
import { rotuloTrial, trialUrgente } from './trial';

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
