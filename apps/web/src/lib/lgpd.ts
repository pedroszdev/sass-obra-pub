import type { LgpdStatus, LgpdTipo } from '../types/admin';

// Urgência do prazo de resposta LGPD (T-196). Só solicitações ainda ABERTAS
// contam para urgência — uma já atendida/recusada não tem prazo a correr.
export type Urgencia = 'vencido' | 'urgente' | 'ok';

const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;

export function classificarPrazo(
  prazoIso: string,
  encerrada: boolean,
  now: Date = new Date(),
): Urgencia | null {
  if (encerrada) return null;
  const prazo = new Date(prazoIso).getTime();
  const agora = now.getTime();
  if (prazo < agora) return 'vencido';
  if (prazo - agora <= TRES_DIAS_MS) return 'urgente';
  return 'ok';
}

export const LGPD_STATUS_TERMINAL: LgpdStatus[] = ['atendida', 'recusada'];

export function encerrada(status: LgpdStatus): boolean {
  return LGPD_STATUS_TERMINAL.includes(status);
}

export const LGPD_TIPO_ROTULO: Record<LgpdTipo, string> = {
  acesso: 'Acesso',
  exportacao: 'Exportação',
  exclusao: 'Exclusão',
  correcao: 'Correção',
  outro: 'Outro',
};

export const LGPD_STATUS_ROTULO: Record<LgpdStatus, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  atendida: 'Atendida',
  recusada: 'Recusada',
};

export const LGPD_STATUS_COR: Record<LgpdStatus, string> = {
  aberta: 'orange',
  em_andamento: 'blue',
  atendida: 'green',
  recusada: 'gray',
};
