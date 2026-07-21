import type { AssinaturaStatus } from '../../types/admin';

// Rótulo PT-BR e cor do status de assinatura, compartilhados entre a lista e o
// detalhe de contas (T-184).
const ROTULOS: Record<AssinaturaStatus, string> = {
  trialing: 'Em teste',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
};

const CORES: Record<AssinaturaStatus, string> = {
  trialing: 'blue',
  active: 'green',
  past_due: 'yellow',
  canceled: 'gray',
};

export function rotuloStatus(s: AssinaturaStatus): string {
  return ROTULOS[s] ?? s;
}

export function corDoStatus(s: AssinaturaStatus): string {
  return CORES[s] ?? 'gray';
}

// Link direto pro customer no Stripe Dashboard (§9: não duplicar ferramenta).
export function stripeCustomerUrl(customerId: string): string {
  return `https://dashboard.stripe.com/customers/${customerId}`;
}
