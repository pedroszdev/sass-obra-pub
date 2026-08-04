import type { ProviderBilling } from '../types/admin';

/**
 * Esta conta é cobrada pelo ASAAS? (T-224, virada do padrão em 04/08)
 *
 * 🔴 **A regra é "não é Stripe", não "é Asaas".** Antes o teste era
 * `provider === 'asaas'`, e quem estava em TRIAL (`provider: null`, porque o
 * trial é nosso e não existe em provedor nenhum) caía na Stripe ao converter —
 * o que tornava o checkout próprio, a régua e o reembolso **inalcançáveis para
 * uma conversão real**.
 *
 * ⚠️ Espelha `cobraPeloAsaas` do backend (`assinaturas/provider.ts`), que é
 * quem MANDA. Esta cópia decide só o que renderizar; se as duas divergirem, a
 * tela oferece um caminho que a API recusa — foi assim que um assinante do
 * Asaas viu botões do Customer Portal da Stripe (bug real, §8).
 */
export function cobraPeloAsaas(provider: ProviderBilling | null): boolean {
  return provider !== 'stripe';
}
