import type { AcessoResumo, AssinaturaStatus } from '../../types/admin';

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

// Situação de ACESSO REAL (T-184 fix) — o sinal principal na tela. Combina o
// status cru com o calcularAcesso do backend para não mentir: um trial vencido
// NÃO é "Em teste", e a cortesia/suspensão aparecem de fato.
export function situacaoAcesso(
  status: AssinaturaStatus,
  acesso: AcessoResumo,
): { label: string; cor: string } {
  if (acesso.suspensa) return { label: 'Suspensa · sem acesso', cor: 'red' };
  if (acesso.cortesiaAtiva) return { label: 'Cortesia ativa', cor: 'teal' };
  if (acesso.permitido) {
    if (acesso.emTrial) {
      return {
        label: `Em teste · faltam ${acesso.diasRestantesTrial}d`,
        cor: 'blue',
      };
    }
    if (status === 'past_due') {
      return { label: 'Pagamento pendente', cor: 'yellow' };
    }
    return { label: 'Ativa', cor: 'green' };
  }
  switch (acesso.motivo) {
    case 'trial_expirado':
      return { label: 'Trial expirado · sem acesso', cor: 'orange' };
    case 'reembolsada':
      return { label: 'Reembolsada · sem acesso', cor: 'gray' };
    default:
      return { label: 'Sem acesso', cor: 'gray' };
  }
}

// Link direto pro customer no Stripe Dashboard (§9: não duplicar ferramenta).
export function stripeCustomerUrl(customerId: string): string {
  return `https://dashboard.stripe.com/customers/${customerId}`;
}
