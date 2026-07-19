import { describe, expect, it } from 'vitest';
import { formatarTelefone, soDigitos, telefoneValido } from './telefone';

describe('formatarTelefone (T-172)', () => {
  it('descarta letras e formata celular (11 dígitos)', () => {
    expect(formatarTelefone('11abc987654321')).toBe('(11) 98765-4321');
  });

  it('formata fixo (10 dígitos)', () => {
    expect(formatarTelefone('1133334444')).toBe('(11) 3333-4444');
  });

  it('formata progressivamente', () => {
    expect(formatarTelefone('1')).toBe('(1');
    expect(formatarTelefone('11')).toBe('(11');
    expect(formatarTelefone('119')).toBe('(11) 9');
    expect(formatarTelefone('11987')).toBe('(11) 987');
  });

  it('ignora dígitos além de 11', () => {
    expect(formatarTelefone('119876543219999')).toBe('(11) 98765-4321');
  });

  it('vazio continua vazio', () => {
    expect(formatarTelefone('')).toBe('');
    expect(formatarTelefone('abc')).toBe('');
  });
});

describe('telefoneValido', () => {
  it('aceita 10 e 11 dígitos', () => {
    expect(telefoneValido('(11) 3333-4444')).toBe(true);
    expect(telefoneValido('(11) 98765-4321')).toBe(true);
  });

  it('rejeita curto/longo demais', () => {
    expect(telefoneValido('11 3333')).toBe(false);
    expect(telefoneValido('119876543219')).toBe(false);
  });

  it('soDigitos remove tudo que não é número', () => {
    expect(soDigitos('(11) 98765-4321')).toBe('11987654321');
  });
});
