// Guarda de redirecionamento interno (T-169). A /entrando aceita um `?next=`
// para onde ir depois de re-hidratar a sessão (ex.: volta do Checkout). Mesmo o
// valor vindo de uma URL que nós controlamos (success_url), validamos para nunca
// redirecionar para fora do app — um `next` externo seria um open redirect.

/**
 * Devolve `next` se for um caminho INTERNO seguro (começa com uma única `/`,
 * sem esquema e sem `//`), senão `null`.
 */
export function caminhoInternoSeguro(next: string | null | undefined): string | null {
  if (!next) return null;
  // Precisa começar com '/' (caminho absoluto do próprio app) — assim
  // `https://evil.com` e `javascript:...` já caem fora...
  if (!next.startsWith('/')) return null;
  // ...mas não '//' nem '/\', que o navegador trata como protocol-relative
  // (outro host). Um '/' seguido de query/rota interna é seguro com o navigate.
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}
