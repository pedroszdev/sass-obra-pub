import { URGENT_DAYS } from './constants';

// Fuso oficial dos editais (PNCP publica em horário de Brasília). As datas chegam
// da API como timestamps UTC (sufixo "Z"); para exibir o dia/hora corretos é
// preciso convertê-las para este fuso — não basta fatiar a string ISO.
const BRT_TZ = 'America/Sao_Paulo';

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

// "YYYY-MM-DD" no fuso de Brasília (en-CA usa esse formato ISO).
const brtYmdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BRT_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const brtTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRT_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Formata um valor em R$ (pt-BR). `null`/`undefined` → "Não informado". */
export function brl(value: number | null | undefined): string {
  if (value == null) return 'Não informado';
  return brlFormatter.format(value);
}

interface Ymd {
  year: number;
  month: number;
  day: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Resolve a data-calendário de uma string ISO:
 * - Só data ("2026-06-20", sem hora/fuso): fatiamos a string como está, pra não
 *   deslocar o dia (ex.: validade de certidão, filtros de período).
 * - Timestamp com hora ("2026-06-26T02:59:00Z", UTC): convertemos para o fuso de
 *   Brasília. Fatiar a string daria o dia em UTC — um dia a mais para horários
 *   noturnos (ex.: prazo às 23:59 vira o dia seguinte).
 */
function calendarYmd(iso: string): Ymd | null {
  if (!iso.includes('T')) {
    const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return null;
    return { year, month, day };
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = brtYmdFormatter.format(date).split('-').map(Number);
  return { year, month, day };
}

/**
 * Formata uma data ISO como dd/MM/yyyy no fuso de Brasília.
 * `null`/`undefined`/inválida → "—".
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const c = calendarYmd(iso);
  if (!c) return '—';
  return `${pad2(c.day)}/${pad2(c.month)}/${c.year}`;
}

/** Formata data ISO como dd/MM/yyyy HH:mm (hora em Brasília; omitida se ausente). */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = fmtDate(iso);
  if (date === '—' || !iso.includes('T')) return date;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${date} ${brtTimeFormatter.format(parsed)}`;
}

/** Dias inteiros de hoje até a data ISO (negativo se já passou), no fuso de Brasília. */
export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const target = calendarYmd(iso);
  if (!target) return Number.POSITIVE_INFINITY;
  const today = calendarYmd(new Date().toISOString());
  if (!today) return Number.POSITIVE_INFINITY;
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.round((targetUtc - todayUtc) / 86_400_000);
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
