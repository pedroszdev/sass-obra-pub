// Situações do PNCP que tiram o edital de jogo (T-114): anulado/revogado
// (proposta impossível) ou suspenso (processo pausado). Espelha
// SITUACOES_INATIVAS do backend — o backend já os esconde da busca/agenda/
// alertas; aqui é só para marcar com badge um edital morto aberto por link
// direto (ex.: um favorito). Dívida §10: const compartilhada ainda duplicada.
const SITUACOES_INATIVAS = ['Anulada', 'Revogada', 'Suspensa'];

// Devolve a situação quando ela é inativa (para exibir no badge), ou null.
export function situacaoInativa(situacao: string | null | undefined): string | null {
  return situacao && SITUACOES_INATIVAS.includes(situacao) ? situacao : null;
}
