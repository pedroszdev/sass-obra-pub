// Rotas que o paywall NÃO pode bloquear (T-130).
//
// 🔴 Bug real (03/08): a isenção era `pathname !== '/assinatura'` — comparação
// exata com UMA rota. Quando o checkout virou página própria (`/assinar`) e
// ganhou uma confirmação (`/assinatura/confirmada`), as duas nasceram DENTRO do
// bloqueio, e o resultado foi um laço fechado: quem perdeu o acesso via o
// PaywallGate, clicava em "Ver planos e assinar", caía em `/assinatura` (isenta),
// clicava em "Assinar agora", ia para `/assinar` — e levava o PaywallGate de
// novo. **A pessoa que mais precisa pagar era a única que não conseguia.**
//
// Por isso a regra virou uma LISTA com prefixo, e não mais um `!==` solto: rota
// de pagamento nova entra aqui e pronto. O modo antigo falhava em silêncio — não
// havia erro, só uma tela errada.
//
// ⚠️ Isto é UX, não segurança. Quem barra de verdade é o backend (402), e lá a
// whitelist é a AUSÊNCIA do `SubscriptionGuard` nos controllers de `assinaturas`
// (§8). As duas listas precisam concordar; se um dia divergirem, o sintoma é
// tela que abre e API que recusa.
const ROTAS_DE_PAGAMENTO = ['/assinatura', '/assinar'];

/**
 * A rota está fora do paywall?
 *
 * ⚠️ Casa a rota exata **ou** um filho dela (`/assinatura/confirmada`), nunca um
 * prefixo solto. `startsWith('/assinar')` sozinho pegaria `/assinaturas-falsa`
 * de brinde — e, pior, esconde que `/assinatura` também começa com `/assinar`,
 * uma coincidência que faria a regra parecer certa por acidente.
 */
export function foraDoPaywall(pathname: string): boolean {
  return ROTAS_DE_PAGAMENTO.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );
}
