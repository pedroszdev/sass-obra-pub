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

// Transições de status permitidas (T-117b). Linear com reabertura de um passo:
//   rascunho → enviada → {ganhou, nao_ganhou}; e a volta (reabertura). Ficar no
//   mesmo status é sempre permitido (edição sem trocar de fase). Qualquer outro
//   salto (ex.: rascunho → ganhou) é inválido → 400 no service.
// Para FRENTE só um passo por vez (proíbe o salto rascunho → ganhou que pulava o
// envio); para TRÁS, reabrir para rascunho é sempre permitido — é o escape hatch
// do lock (T-117b): para editar valores/itens, reabra a proposta.
const TRANSICOES: Record<PropostaStatus, readonly PropostaStatus[]> = {
  [PropostaStatus.RASCUNHO]: [PropostaStatus.ENVIADA],
  [PropostaStatus.ENVIADA]: [
    PropostaStatus.RASCUNHO,
    PropostaStatus.GANHOU,
    PropostaStatus.NAO_GANHOU,
  ],
  [PropostaStatus.GANHOU]: [PropostaStatus.ENVIADA, PropostaStatus.RASCUNHO],
  [PropostaStatus.NAO_GANHOU]: [
    PropostaStatus.ENVIADA,
    PropostaStatus.RASCUNHO,
  ],
};

/** true se a proposta pode ir de `de` para `para` (mesmo status = no-op ok). */
export function isTransicaoValida(
  de: PropostaStatus,
  para: PropostaStatus,
): boolean {
  return de === para || TRANSICOES[de].includes(para);
}

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
