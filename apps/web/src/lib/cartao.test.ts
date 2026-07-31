import { describe, expect, it } from 'vitest';
import {
  bandeiraDoNumero,
  formatarCep,
  formatarNumeroCartao,
  formatarValidade,
  numeroCartaoPlausivel,
  partesDaValidade,
  passaNoLuhn,
  tamanhoDoCvv,
  validadeExpirada,
} from './cartao';

describe('bandeira e tamanhos', () => {
  it('reconhece as bandeiras pelo prefixo', () => {
    expect(bandeiraDoNumero('4444444444444444')).toBe('visa');
    expect(bandeiraDoNumero('5162306219378829')).toBe('mastercard');
    expect(bandeiraDoNumero('378282246310005')).toBe('amex');
    expect(bandeiraDoNumero('9999')).toBeNull();
  });

  it('Amex tem CVV de 4 dígitos — o resto, 3', () => {
    expect(tamanhoDoCvv('amex')).toBe(4);
    expect(tamanhoDoCvv('visa')).toBe(3);
    expect(tamanhoDoCvv(null)).toBe(3);
  });
});

describe('máscara do número', () => {
  it('agrupa de 4 em 4 e capa no tamanho da bandeira', () => {
    expect(formatarNumeroCartao('4444444444444444')).toBe('4444 4444 4444 4444');
    // Excesso é ignorado: sem isto o campo aceitava qualquer coisa.
    expect(formatarNumeroCartao('44444444444444449999')).toBe(
      '4444 4444 4444 4444',
    );
  });

  it('Amex agrupa 4-6-5, como está impresso no cartão', () => {
    expect(formatarNumeroCartao('378282246310005')).toBe('3782 822463 10005');
  });
});

describe('validade', () => {
  it('formata MM/AA enquanto digita', () => {
    expect(formatarValidade('1')).toBe('1');
    expect(formatarValidade('12')).toBe('12');
    expect(formatarValidade('1230')).toBe('12/30');
    expect(formatarValidade('123099')).toBe('12/30');
  });

  it('quebra em mês e ano de 4 dígitos', () => {
    expect(partesDaValidade('12/30')).toEqual({ mes: '12', ano: '2030' });
  });

  it('recusa mês inválido', () => {
    expect(partesDaValidade('13/30')).toBeNull();
    expect(partesDaValidade('00/30')).toBeNull();
  });

  it('detecta cartão vencido — o erro mais comum, e o emissor só diria depois', () => {
    const hoje = new Date('2026-07-31T12:00:00Z');
    expect(validadeExpirada('06/26', hoje)).toBe(true);
    expect(validadeExpirada('07/26', hoje)).toBe(false); // mês corrente vale
    expect(validadeExpirada('12/30', hoje)).toBe(false);
  });
});

describe('comprimento do número', () => {
  it('aceita o cartão de teste do sandbox — que NÃO passa no Luhn', () => {
    // 🔴 Medido: a soma de Luhn de 4444444444444444 dá 96. Se validássemos
    // Luhn, o ambiente de teste do Asaas ficaria inutilizável.
    expect(numeroCartaoPlausivel('4444 4444 4444 4444')).toBe(true);
  });

  it('recusa número curto demais', () => {
    expect(numeroCartaoPlausivel('4444 4444')).toBe(false);
  });

  it('cobra 15 dígitos da Amex, não 16', () => {
    expect(numeroCartaoPlausivel('378282246310005')).toBe(true);
    expect(numeroCartaoPlausivel('3782822463100051')).toBe(false);
  });
});

describe('CEP', () => {
  it('formata e capa em 8 dígitos', () => {
    expect(formatarCep('89010000')).toBe('89010-000');
    expect(formatarCep('890100009999')).toBe('89010-000');
  });
});

describe('Luhn (aviso, não bloqueio)', () => {
  it('detecta dígito trocado', () => {
    expect(passaNoLuhn('5555 5555 5555 4444')).toBe(true);
    expect(passaNoLuhn('5555 5555 5555 4445')).toBe(false);
  });

  it('🔴 o cartão de teste do sandbox REPROVA — por isso é aviso, não bloqueio', () => {
    // Medido: a soma de Luhn de 4444444444444444 dá 96. Se este valor virasse
    // bloqueio, o caminho feliz do sandbox ficaria intestável.
    expect(passaNoLuhn('4444 4444 4444 4444')).toBe(false);
    expect(numeroCartaoPlausivel('4444 4444 4444 4444')).toBe(true);
  });

  it('não avisa enquanto o número está incompleto', () => {
    expect(passaNoLuhn('4444')).toBe(true);
  });
});
