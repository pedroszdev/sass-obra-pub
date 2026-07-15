import { cnpjValido } from '../src/common/cnpj';

describe('cnpj (T-153)', () => {
  it('aceita CNPJ válido (com e sem máscara)', () => {
    // CNPJ de exemplo da Receita, com DV correto.
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita DV errado', () => {
    expect(cnpjValido('11222333000180')).toBe(false);
  });

  it('rejeita quantidade de dígitos diferente de 14', () => {
    expect(cnpjValido('112223330001')).toBe(false);
    expect(cnpjValido('112223330001812')).toBe(false);
  });

  it('rejeita sequências de um dígito só (DV "válido" pela conta)', () => {
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
  });

  it('rejeita string vazia ou com letras (formato numérico)', () => {
    expect(cnpjValido('')).toBe(false);
    expect(cnpjValido('11222333000AB1')).toBe(false);
  });
});
