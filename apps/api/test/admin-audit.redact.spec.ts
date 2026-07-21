import { resumirPayload } from '../src/admin/admin-audit.redact';

describe('resumirPayload (T-182)', () => {
  it('redige chaves sensíveis', () => {
    const r = resumirPayload({
      password: 'segredo123',
      senha: 'x',
      token: 'abc',
      motivo: 'cortesia',
    });
    expect(r).toEqual({
      password: '[redigido]',
      senha: '[redigido]',
      token: '[redigido]',
      motivo: 'cortesia',
    });
  });

  it('trunca string longa', () => {
    const longa = 'a'.repeat(200);
    const r = resumirPayload({ nota: longa });
    expect((r?.nota as string).endsWith('…')).toBe(true);
    expect((r?.nota as string).length).toBeLessThanOrEqual(121);
  });

  it('não desce em objeto/array aninhado (evita PII escondida e blob)', () => {
    const r = resumirPayload({
      lista: [1, 2, 3],
      aninhado: { cnpj: '12345678000199' },
    });
    expect(r).toEqual({ lista: '[array]', aninhado: '[objeto]' });
  });

  it('preserva number e boolean', () => {
    expect(resumirPayload({ dias: 7, ativo: true })).toEqual({
      dias: 7,
      ativo: true,
    });
  });

  it('devolve null para body vazio, não-objeto ou array', () => {
    expect(resumirPayload({})).toBeNull();
    expect(resumirPayload(null)).toBeNull();
    expect(resumirPayload('texto')).toBeNull();
    expect(resumirPayload([1, 2])).toBeNull();
  });
});
