import { describe, expect, it } from 'vitest';
import { decidirAcessoAdmin } from './admin-access';

describe('decidirAcessoAdmin (T-181)', () => {
  it('espera enquanto a sessão carrega', () => {
    expect(decidirAcessoAdmin('loading', 'ADMIN')).toBe('loading');
    expect(decidirAcessoAdmin('loading', undefined)).toBe('loading');
  });

  it('libera só ADMIN autenticado', () => {
    expect(decidirAcessoAdmin('authenticated', 'ADMIN')).toBe('allow');
  });

  it('nega usuário comum autenticado', () => {
    expect(decidirAcessoAdmin('authenticated', 'USER')).toBe('deny');
  });

  it('nega anônimo (sem role)', () => {
    expect(decidirAcessoAdmin('anonymous', undefined)).toBe('deny');
    expect(decidirAcessoAdmin('anonymous', 'ADMIN')).toBe('deny');
  });
});
