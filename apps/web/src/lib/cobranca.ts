import type { CobrancaPortal } from '../types/auth';

// Rótulos das cobranças do Asaas (T-216). Fora do arquivo de componente porque
// exportar função de lá quebra o fast refresh do Vite — e porque isto é
// tradução de domínio, não UI.

/** Status CRU do provedor → o que o cliente entende. */
export const STATUS_COBRANCA: Record<string, { texto: string; cor: string }> = {
  PENDING: { texto: 'Aguardando pagamento', cor: 'alerta' },
  RECEIVED: { texto: 'Pago', cor: 'apto' },
  CONFIRMED: { texto: 'Pago', cor: 'apto' },
  OVERDUE: { texto: 'Vencida', cor: 'red' },
  REFUNDED: { texto: 'Estornada', cor: 'gray' },
  CANCELED: { texto: 'Cancelada', cor: 'gray' },
};

export const MEIO_COBRANCA: Record<string, string> = {
  BOLETO: 'Boleto',
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão',
  // `UNDEFINED` não é erro: é o modo em que o pagador escolhe boleto ou Pix na
  // hora de pagar (T-208/T-209). Mostrar "UNDEFINED" ao cliente seria vazar
  // jargão do provedor.
  UNDEFINED: 'Boleto ou Pix',
};

/**
 * Como esta assinatura é cobrada, lido da cobrança mais recente.
 *
 * O Asaas não expõe "cartão salvo" para nós, e com `UNDEFINED` o meio só se
 * decide no pagamento — então o rótulo honesto sai do que existe, não de um
 * campo de cadastro que não temos.
 */
export function formaDeCobranca(
  cobrancas: CobrancaPortal[],
): string | undefined {
  const meio = cobrancas[0]?.meio;
  return meio ? (MEIO_COBRANCA[meio] ?? meio) : undefined;
}
