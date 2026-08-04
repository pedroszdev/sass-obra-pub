import { cobraPeloAsaas } from '../src/assinaturas/provider';

// Virada do padrão para o Asaas (T-224, 04/08).
//
// 🔴 A regra é "não é Stripe", não "é Asaas". Antes o teste era
// `provider === 'asaas'`, e quem estava em TRIAL (`provider: null`) caía na
// Stripe ao converter — o que tornava o checkout próprio, a régua de
// inadimplência e o reembolso INALCANÇÁVEIS para uma conversão real.

describe('cobraPeloAsaas', () => {
  // O caso que motivou a virada: trial é `null` porque o trial é NOSSO e não
  // existe em provedor nenhum. Ele precisa converter no provedor novo.
  it('trial (null) converte pelo Asaas', () => {
    expect(cobraPeloAsaas(null)).toBe(true);
  });

  it('asaas explícito segue no Asaas', () => {
    expect(cobraPeloAsaas('asaas')).toBe(true);
  });

  // A única exceção, e é ela que protege quem já pagou: assinante da Stripe
  // continua sendo atendido por ela até o corte completo.
  it('SÓ quem tem stripe explícito fica na Stripe', () => {
    expect(cobraPeloAsaas('stripe')).toBe(false);
  });
});
