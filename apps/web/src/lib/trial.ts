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

/**
 * Quanto do teste já passou, em % (0–100) — só para a barra de progresso.
 *
 * Isto é DECORAÇÃO, e por isso pode ser calculado aqui: o número que o usuário
 * lê ("faltam 4 dias") continua vindo do backend (§3.3). A barra só pinta o que
 * aquele número já disse.
 *
 * Datas ausentes ou incoerentes → 0: uma barra vazia é honesta; uma barra cheia
 * por erro de conta diria "seu teste acabou" a quem ainda tem dias.
 */
export function progressoTrial(
  inicio: string | null | undefined,
  fim: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!inicio || !fim) return 0;
  const i = new Date(inicio).getTime();
  const f = new Date(fim).getTime();
  if (Number.isNaN(i) || Number.isNaN(f) || f <= i) return 0;
  const pct = ((now.getTime() - i) / (f - i)) * 100;
  return Math.min(100, Math.max(0, pct));
}
