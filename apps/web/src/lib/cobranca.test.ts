import { describe, expect, it } from 'vitest';
import type { CobrancaPortal } from '../types/auth';
import { formaDeCobranca, pagaComCartao } from './cobranca';

function cobranca(meio: string | null): CobrancaPortal {
  return {
    id: 'pay_1',
    valor: 9900,
    vencimento: '2026-09-09T03:00:00.000Z',
    status: 'PENDING',
    meio,
    pagarUrl: null,
    boletoUrl: null,
    comprovanteUrl: null,
  };
}

describe('pagaComCartao — decide se "Trocar cartão" existe', () => {
  it('cartão → o botão existe', () => {
    expect(pagaComCartao([cobranca('CREDIT_CARD')])).toBe(true);
  });

  // 🔴 O bug de 03/08: quem paga por boleto/Pix via o botão, clicava e recebia
  // erro — com "Forma de pagamento: Boleto ou Pix" logo acima, na mesma tela.
  it('boleto, Pix e "o pagador escolhe" → sem botão', () => {
    for (const meio of ['BOLETO', 'PIX', 'UNDEFINED']) {
      expect(pagaComCartao([cobranca(meio)])).toBe(false);
    }
  });

  it('sem cobrança (portal falhou ou assinatura nova) → sem botão', () => {
    expect(pagaComCartao([])).toBe(false);
  });

  it('meio ausente → sem botão', () => {
    expect(pagaComCartao([cobranca(null)])).toBe(false);
  });

  it('lê a cobrança MAIS RECENTE, a mesma fonte do rótulo', () => {
    // Se as duas funções lessem posições diferentes, a tela voltaria a se
    // contradizer — botão de cartão sobre rótulo de boleto.
    const lista = [cobranca('CREDIT_CARD'), cobranca('BOLETO')];
    expect(pagaComCartao(lista)).toBe(true);
    expect(formaDeCobranca(lista)).toBe('Cartão');

    const invertida = [cobranca('BOLETO'), cobranca('CREDIT_CARD')];
    expect(pagaComCartao(invertida)).toBe(false);
    expect(formaDeCobranca(invertida)).toBe('Boleto');
  });
});

describe('formaDeCobranca', () => {
  it('traduz o jargão do provedor', () => {
    expect(formaDeCobranca([cobranca('UNDEFINED')])).toBe('Boleto ou Pix');
    expect(formaDeCobranca([cobranca('PIX')])).toBe('Pix');
  });

  it('meio desconhecido passa cru, em vez de sumir', () => {
    expect(formaDeCobranca([cobranca('MEIO_NOVO')])).toBe('MEIO_NOVO');
  });

  it('sem cobrança → sem rótulo', () => {
    expect(formaDeCobranca([])).toBeUndefined();
  });
});
