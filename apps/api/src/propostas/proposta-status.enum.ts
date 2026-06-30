// Ciclo de vida de uma proposta de preço (BACKLOG T-60, estendido na T-84).
// rascunho: o empreiteiro ainda monta/preenche os itens.
// enviada: a proposta foi anexada/entregue ao processo da licitação (dataEnvio).
// ganhou / nao_ganhou: resultado do certame (decidido após a sessão).
// A transição é linear: rascunho → enviada → ganhou | nao_ganhou (e reabertura
// volta um passo). O front mostra um badge por status.
export enum PropostaStatus {
  RASCUNHO = 'rascunho',
  ENVIADA = 'enviada',
  GANHOU = 'ganhou',
  NAO_GANHOU = 'nao_ganhou',
}

// Statuses que significam "já enviada ao certame" (têm dataEnvio). Útil para
// contagens e para a regra da dataEnvio no service.
export const STATUS_ENVIADOS: readonly PropostaStatus[] = [
  PropostaStatus.ENVIADA,
  PropostaStatus.GANHOU,
  PropostaStatus.NAO_GANHOU,
];

// Regra da data de envio (T-84): set ao entrar em enviada/ganhou/nao_ganhou (se
// ainda não houver), preservada entre esses; limpa ao voltar pra rascunho. Pura
// e testável — `now` é injetado (§3.3). O front nunca manda dataEnvio.
export function resolveDataEnvio(
  status: PropostaStatus,
  atual: Date | null,
  now: Date,
): Date | null {
  if (status === PropostaStatus.RASCUNHO) return null;
  return atual ?? now;
}
