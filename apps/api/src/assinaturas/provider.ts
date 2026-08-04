/** Quem cobra uma assinatura. `null` = ninguém ainda (trial). */
export type ProviderCobranca = 'stripe' | 'asaas' | null;

/**
 * Esta conta é cobrada pelo ASAAS? (T-224, virada do padrão em 04/08)
 *
 * 🔴 **A regra é "não é Stripe", não "é Asaas" — e a diferença é o corte.**
 * Antes, o teste era `provider === 'asaas'`, então quem estava em TRIAL
 * (`provider: null`, porque o trial é nosso e não existe em provedor nenhum)
 * caía na Stripe ao converter. Consequência prática: **todo o caminho novo do
 * Asaas — checkout próprio, régua de inadimplência, reembolso, reconciliação —
 * era inalcançável para uma conversão real.** Só via aquilo quem já estivesse no
 * Asaas, ou seja, quase ninguém.
 *
 * Invertendo, o padrão passa a ser o provedor novo: conversão nova nasce no
 * Asaas, e **só quem tem `'stripe'` explícito continua lá** — o que preserva
 * quem já assinou, que é o único caso em que a Stripe ainda precisa responder.
 *
 * ⚠️ Isto NÃO desliga a Stripe. O código dela segue inteiro, atendendo os
 * assinantes existentes; removê-lo é a outra metade da T-224, e o backlog manda
 * fazer depois de uma semana observando cobrança real (e depende de CNPJ ativo,
 * T-179 publicada e backup com restore testado).
 *
 * ⚠️ **Consequência operacional que não pode ser esquecida:** o preço do Asaas
 * vem do config store (T-213), e sem ele a cobrança responde **503** de
 * propósito. Com esta virada, preço não configurado em `/admin` → **ninguém
 * consegue assinar**. Era falha fechada de um caminho lateral; virou falha
 * fechada do caminho principal.
 */
export function cobraPeloAsaas(provider: ProviderCobranca): boolean {
  return provider !== 'stripe';
}
