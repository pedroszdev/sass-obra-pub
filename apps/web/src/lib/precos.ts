import type { Plano } from '../types/auth';

// Apresentação dos preços (T-131). Os VALORES vêm da Stripe via
// `GET /assinaturas/precos` — nunca escreva um número de preço no front: ele
// mentiria no dia seguinte a uma mudança no Dashboard.

const CENTAVOS_POR_REAL = 100;

/**
 * Centavos → "R$ 1.490" / "R$ 149,90".
 *
 * Omite os centavos quando são zero: "R$ 1.490,00" num card de plano é ruído.
 * Quando existem, aparecem — arredondar o preço de alguém é inaceitável.
 */
export function precoBRL(centavos: number): string {
  const reais = centavos / CENTAVOS_POR_REAL;
  const redondo = Number.isInteger(reais);
  return reais.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: redondo ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Sufixo do período: "/mês", "/ano". */
export function sufixoPlano(plano: Plano): string {
  return plano === 'anual' ? '/ano' : '/mês';
}

export function nomePlano(plano: Plano): string {
  return plano === 'anual' ? 'Plano anual' : 'Plano mensal';
}

/** "2 meses grátis" / "1 mês grátis". `null` quando não há vantagem a anunciar. */
export function rotuloEconomia(mesesGratis: number | null): string | null {
  if (!mesesGratis || mesesGratis < 1) return null;
  return mesesGratis === 1 ? '1 mês grátis' : `${mesesGratis} meses grátis`;
}

/** Rótulo em pt-BR do status cru de fatura da Stripe. */
export function rotuloStatusFatura(status: string): {
  texto: string;
  cor: string;
} {
  switch (status) {
    case 'paid':
      return { texto: 'Paga', cor: 'apto' };
    case 'open':
      return { texto: 'Em aberto', cor: 'orange' };
    case 'void':
      return { texto: 'Cancelada', cor: 'gray' };
    case 'uncollectible':
      return { texto: 'Não paga', cor: 'alerta' };
    default:
      return { texto: status, cor: 'gray' };
  }
}
