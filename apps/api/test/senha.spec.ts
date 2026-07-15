import { requisitosSenha, senhaForte } from '../src/common/senha';

describe('senha (T-153)', () => {
  it('aceita senha com maiúscula, minúscula, número e especial', () => {
    expect(senhaForte('Obra@2026')).toBe(true);
  });

  it('rejeita sem maiúscula', () => {
    expect(senhaForte('obra@2026')).toBe(false);
  });

  it('rejeita sem minúscula', () => {
    expect(senhaForte('OBRA@2026')).toBe(false);
  });

  it('rejeita sem número', () => {
    expect(senhaForte('Obra@obra')).toBe(false);
  });

  it('rejeita sem caractere especial', () => {
    expect(senhaForte('Obra2026')).toBe(false);
  });

  it('rejeita curta demais (< 8)', () => {
    expect(senhaForte('Ob@1')).toBe(false);
  });

  it('rejeita longa demais (> 72, teto do bcrypt)', () => {
    const longa = 'A@1' + 'a'.repeat(70); // 73 caracteres
    expect(senhaForte(longa)).toBe(false);
  });

  it('requisitosSenha aponta cada regra individualmente', () => {
    expect(requisitosSenha('obra2026')).toEqual({
      tamanho: true,
      maiuscula: false,
      minuscula: true,
      numero: true,
      especial: false,
    });
  });
});
