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

/**
 * Esta assinatura é cobrada no CARTÃO? — quem decide se "Trocar cartão" existe.
 *
 * 🔴 Bug real (03/08): o botão só era escondido em assinatura cancelada, então
 * quem paga por boleto/Pix o via, clicava, e recebia um erro. Pior que o erro
 * era a contradição na mesma tela: "Forma de pagamento: Boleto ou Pix" logo
 * acima de um botão para trocar um cartão que não existe.
 *
 * ⚠️ **Lê da MESMA fonte que `formaDeCobranca`** — a cobrança mais recente — e é
 * por isso que mora aqui do lado. Duas fontes para o mesmo fato é como o rótulo
 * e o botão passam a discordar de novo, um dia, sem ninguém notar.
 *
 * ⚠️ Sem cobrança nenhuma o retorno é `false`: pode ser assinatura recém-criada
 * ou a chamada do portal que falhou, e nos dois casos não sabemos o meio. Um
 * botão ausente que volta no recarregar é melhor que um botão que erra — e é o
 * mesmo estado em que a tela já não mostra forma de pagamento alguma.
 */
export function pagaComCartao(cobrancas: CobrancaPortal[]): boolean {
  return cobrancas[0]?.meio === 'CREDIT_CARD';
}
