import { describe, expect, it } from 'vitest';
import { caminhoInternoSeguro } from './navegacao';

describe('caminhoInternoSeguro (T-169)', () => {
  it('aceita caminho interno com query', () => {
    expect(caminhoInternoSeguro('/assinatura?status=ok')).toBe(
      '/assinatura?status=ok',
    );
    expect(caminhoInternoSeguro('/')).toBe('/');
  });

  it('rejeita URL externa e esquemas', () => {
    expect(caminhoInternoSeguro('https://evil.com')).toBeNull();
    expect(caminhoInternoSeguro('javascript:alert(1)')).toBeNull();
    expect(caminhoInternoSeguro('http://x')).toBeNull();
  });

  it('rejeita protocol-relative (//host e /\\host)', () => {
    expect(caminhoInternoSeguro('//evil.com')).toBeNull();
    expect(caminhoInternoSeguro('/\\evil.com')).toBeNull();
  });

  it('vazio/ausente vira null', () => {
    expect(caminhoInternoSeguro(null)).toBeNull();
    expect(caminhoInternoSeguro(undefined)).toBeNull();
    expect(caminhoInternoSeguro('')).toBeNull();
  });

  it('não rejeita ":" na query (falso-positivo comum)', () => {
    expect(caminhoInternoSeguro('/x?u=http://y')).toBe('/x?u=http://y');
  });
});
