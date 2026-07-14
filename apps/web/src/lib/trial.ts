// Rótulo e urgência do teste grátis (T-131). Puro e testável — a UI só pinta.
//
// Os DIAS vêm calculados do backend (§3.3): o front nunca conta sozinho, senão
// "quantos dias me restam" teria duas versões (a do sistema e a da tela) no dia
// em que o fuso ou o arredondamento discordassem.

// A partir daqui o teste vira urgência (cor âmbar, tom diferente).
export const DIAS_URGENTE = 3;

export function rotuloTrial(dias: number): string {
  if (dias <= 0) return 'Encerrado';
  return dias === 1 ? 'Último dia' : `${dias} dias`;
}

export function trialUrgente(dias: number): boolean {
  return dias <= DIAS_URGENTE;
}
