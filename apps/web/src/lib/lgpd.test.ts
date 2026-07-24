import { describe, expect, it } from 'vitest';
import { classificarPrazo } from './lgpd';

const NOW = new Date('2026-07-23T12:00:00.000Z');

describe('classificarPrazo (T-196)', () => {
  it('vencido quando o prazo já passou', () => {
    expect(classificarPrazo('2026-07-22T12:00:00.000Z', false, NOW)).toBe(
      'vencido',
    );
  });

  it('urgente quando faltam ≤ 3 dias', () => {
    expect(classificarPrazo('2026-07-25T12:00:00.000Z', false, NOW)).toBe(
      'urgente',
    );
  });

  it('ok quando faltam mais de 3 dias', () => {
    expect(classificarPrazo('2026-08-05T12:00:00.000Z', false, NOW)).toBe('ok');
  });

  it('null quando a solicitação já foi encerrada (sem prazo a correr)', () => {
    expect(classificarPrazo('2026-07-01T12:00:00.000Z', true, NOW)).toBeNull();
  });
});
