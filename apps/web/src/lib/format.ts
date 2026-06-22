import { URGENT_DAYS } from './constants';

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** Formata um valor em R$ (pt-BR). `null`/`undefined` → "Não informado". */
export function brl(value: number | null | undefined): string {
  if (value == null) return 'Não informado';
  return brlFormatter.format(value);
}

/**
 * Formata uma data ISO como dd/MM/yyyy. Fatiamos a string (sem `new Date`) para
 * não sofrer com fuso horário em datas sem hora (ex.: "2026-06-20").
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [year, month, day] = iso.slice(0, 10).split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}

/** Formata data ISO como dd/MM/yyyy HH:mm (hora omitida se ausente). */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = fmtDate(iso);
  const time = iso.slice(11, 16);
  return time ? `${date} ${time}` : date;
}

/** Dias inteiros de hoje até a data ISO (negativo se já passou). */
export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const target = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export interface PrazoInfo {
  /** Data formatada (dd/MM/yyyy) ou "Não informado". */
  fmt: string;
  /** Verdadeiro quando faltam `urgentDays` dias ou menos (e não passou). */
  urgente: boolean;
  /** Texto curto do badge urgente ("Encerra hoje/amanhã/em N dias"). */
  badge: string;
}

/** Deriva o estado de exibição de um prazo de proposta. */
export function prazoFlags(
  prazo: string | null | undefined,
  urgentDays: number = URGENT_DAYS,
): PrazoInfo {
  if (!prazo) return { fmt: 'Não informado', urgente: false, badge: '' };
  const dias = daysUntil(prazo);
  const urgente = dias >= 0 && dias <= urgentDays;
  let badge = '';
  if (urgente) {
    badge =
      dias === 0
        ? 'Encerra hoje'
        : dias === 1
          ? 'Encerra amanhã'
          : `Encerra em ${dias} dias`;
  }
  return { fmt: fmtDate(prazo), urgente, badge };
}
