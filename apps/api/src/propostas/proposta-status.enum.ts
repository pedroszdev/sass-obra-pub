// Estado de uma proposta de preço (BACKLOG T-60). Começa como rascunho enquanto
// o empreiteiro monta/preenche os itens; vira finalizada quando está pronta para
// anexar ao processo da licitação (export — T-70).
export enum PropostaStatus {
  RASCUNHO = 'rascunho',
  FINALIZADA = 'finalizada',
}
