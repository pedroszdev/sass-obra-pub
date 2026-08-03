import { describe, expect, it } from 'vitest';
import { foraDoPaywall } from './paywall';

// 🔴 Este teste existe por causa de um laço fechado (03/08): o checkout virou
// página própria e nasceu DENTRO do paywall, então quem perdeu o acesso ia do
// PaywallGate para /assinatura, clicava em assinar, e levava o PaywallGate de
// novo. A pessoa que mais precisava pagar era a única que não conseguia.

describe('foraDoPaywall', () => {
  it('libera as rotas de pagamento', () => {
    expect(foraDoPaywall('/assinatura')).toBe(true);
    expect(foraDoPaywall('/assinar')).toBe(true);
    expect(foraDoPaywall('/assinatura/confirmada')).toBe(true);
  });

  it('bloqueia o resto do produto', () => {
    for (const rota of [
      '/',
      '/editais',
      '/editais/abc',
      '/orcamentos',
      '/documentos',
      '/perfil',
    ]) {
      expect(foraDoPaywall(rota)).toBe(false);
    }
  });

  // Prefixo solto liberaria rota vizinha de brinde. E `/assinatura` por acaso
  // começa com `/assinar` — coincidência que faria a regra errada parecer certa.
  it('não libera rota que apenas COMEÇA com o nome de uma isenta', () => {
    expect(foraDoPaywall('/assinaturas-falsa')).toBe(false);
    expect(foraDoPaywall('/assinarx')).toBe(false);
  });

  it('libera filhos das rotas de pagamento', () => {
    expect(foraDoPaywall('/assinar/qualquer')).toBe(true);
  });
});
