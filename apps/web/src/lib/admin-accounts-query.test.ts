import { describe, expect, it } from 'vitest';
import { montarQueryContas } from './admin-accounts-query';

describe('montarQueryContas (T-184)', () => {
  it('vazio → string vazia', () => {
    expect(montarQueryContas({})).toBe('');
  });

  it('serializa emailVerificado como 1/0', () => {
    expect(montarQueryContas({ emailVerificado: true })).toBe(
      '?emailVerificado=1',
    );
    expect(montarQueryContas({ emailVerificado: false })).toBe(
      '?emailVerificado=0',
    );
  });

  it('inclui só o preenchido e trima texto', () => {
    expect(
      montarQueryContas({ email: '  fulano  ', status: 'active', page: 2 }),
    ).toBe('?email=fulano&status=active&page=2');
  });

  it('ignora string só com espaços', () => {
    expect(montarQueryContas({ email: '   ', cnpj: '' })).toBe('');
  });
});
