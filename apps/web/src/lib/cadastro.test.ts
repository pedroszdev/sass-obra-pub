import { describe, expect, it } from 'vitest';
import {
  cnpjValido,
  formatarCnpj,
  soDigitos,
  validarRegistro,
  type RegistroForm,
} from './cadastro';

// CNPJ com DV válido, reusado nos testes (11.222.333/0001-81).
const CNPJ_VALIDO = '11222333000181';

const valido = (over: Partial<RegistroForm> = {}): RegistroForm => ({
  name: 'Fulano da Silva',
  email: 'fulano@empresa.com.br',
  password: 'Senha@1234',
  uf: 'SC',
  cnpj: '',
  ...over,
});

describe('soDigitos / formatarCnpj (T-100)', () => {
  it('soDigitos remove tudo que não é dígito', () => {
    expect(soDigitos('12.345.678/0001-99')).toBe('12345678000199');
  });

  it('formatarCnpj aplica a máscara progressivamente', () => {
    expect(formatarCnpj('12345678000199')).toBe('12.345.678/0001-99');
    expect(formatarCnpj('12345')).toBe('12.345');
    // Ignora excesso de dígitos (limita a 14).
    expect(formatarCnpj('123456780001999999')).toBe('12.345.678/0001-99');
  });
});

describe('validarRegistro (T-100)', () => {
  it('formulário válido → sem erros', () => {
    expect(validarRegistro(valido())).toEqual({});
  });

  it('nome curto, e-mail inválido, senha fraca e UF ausente acusam erro', () => {
    const erros = validarRegistro(
      valido({ name: 'A', email: 'invalido', password: '123', uf: '' }),
    );
    expect(erros.name).toBeDefined();
    expect(erros.email).toBeDefined();
    expect(erros.password).toBeDefined();
    expect(erros.uf).toBeDefined();
  });

  it('senha sem maiúscula/número/especial (só letras) acusa erro', () => {
    expect(validarRegistro(valido({ password: 'senhafraca' })).password).toBeDefined();
  });

  it('CNPJ vazio é aceito (opcional)', () => {
    expect(validarRegistro(valido({ cnpj: '' })).cnpj).toBeUndefined();
  });

  it('CNPJ com dígitos a menos acusa erro', () => {
    expect(validarRegistro(valido({ cnpj: '123' })).cnpj).toBeDefined();
  });

  it('CNPJ com 14 dígitos mas DV errado acusa erro', () => {
    expect(validarRegistro(valido({ cnpj: '11222333000180' })).cnpj).toBeDefined();
  });

  it('CNPJ válido (mascarado) é aceito', () => {
    expect(
      validarRegistro(valido({ cnpj: formatarCnpj(CNPJ_VALIDO) })).cnpj,
    ).toBeUndefined();
  });
});

describe('cnpjValido (T-153)', () => {
  it('aceita CNPJ com DV correto (com e sem máscara)', () => {
    expect(cnpjValido(CNPJ_VALIDO)).toBe(true);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita DV errado e sequências de um dígito só', () => {
    expect(cnpjValido('11222333000180')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
  });
});
