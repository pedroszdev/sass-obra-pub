import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { URGENT_DAYS } from './constants';
import { brl, daysUntil, fmtDate, fmtDateTime, prazoFlags } from './format';

// Normaliza espaços (o Intl de moeda usa NBSP/narrow-NBSP entre "R$" e o número).
const norm = (s: string): string => s.replace(/\s+/g, ' ');

describe('brl', () => {
  it('formata em reais sem centavos', () => {
    expect(norm(brl(1056985.44))).toBe('R$ 1.056.985');
  });

  it('retorna "Não informado" para null/undefined', () => {
    expect(brl(null)).toBe('Não informado');
    expect(brl(undefined)).toBe('Não informado');
  });
});

describe('fmtDate', () => {
  // Regressão do bug de fuso: o PNCP publica em horário de Brasília e a API
  // entrega timestamps UTC. Um prazo às 23:59 BRT vira 02:59Z do dia seguinte —
  // antes a tela mostrava o dia errado (um a mais).
  it('exibe timestamps UTC no fuso de Brasília (prazo 23:59 não vira o dia seguinte)', () => {
    expect(fmtDate('2026-06-26T02:59:00.000Z')).toBe('25/06/2026');
  });

  it('mantém o dia para horários diurnos', () => {
    expect(fmtDate('2026-06-11T11:41:22.000Z')).toBe('11/06/2026');
  });

  it('preserva datas puras (YYYY-MM-DD) sem deslocar o dia', () => {
    // Ex.: validade de certidão e filtros de período — não têm fuso.
    expect(fmtDate('2026-08-15')).toBe('15/08/2026');
  });

  it('retorna "—" para vazio/nulo/inválido', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
    expect(fmtDate('')).toBe('—');
    expect(fmtDate('lixo')).toBe('—');
  });
});

describe('fmtDateTime', () => {
  it('exibe a hora no fuso de Brasília', () => {
    // 12:27Z = 09:27 em Brasília.
    expect(fmtDateTime('2026-06-25T12:27:15.846Z')).toBe('25/06/2026 09:27');
  });

  it('omite a hora quando a string é só data', () => {
    expect(fmtDateTime('2026-08-15')).toBe('15/08/2026');
  });

  it('retorna "—" para nulo', () => {
    expect(fmtDateTime(null)).toBe('—');
  });
});

describe('daysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // "Hoje" fixo: 25/06/2026 09:00 BRT (12:00Z).
    vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conta em dias-calendário de Brasília (prazo noturno = mesmo dia)', () => {
    // 25/06 23:59 BRT — ainda é hoje, não amanhã.
    expect(daysUntil('2026-06-26T02:59:00.000Z')).toBe(0);
    expect(daysUntil('2026-06-25')).toBe(0);
  });

  it('conta dias futuros e passados', () => {
    expect(daysUntil('2026-06-30')).toBe(5);
    expect(daysUntil('2026-06-20')).toBe(-5);
  });

  it('retorna +Infinity para nulo', () => {
    expect(daysUntil(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('prazoFlags', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marca urgência e monta o badge até URGENT_DAYS', () => {
    const hoje = prazoFlags('2026-06-25');
    expect(hoje.urgente).toBe(true);
    expect(hoje.badge).toBe('Encerra hoje');

    const amanha = prazoFlags('2026-06-26');
    expect(amanha.urgente).toBe(true);
    expect(amanha.badge).toBe('Encerra amanhã');

    const limite = prazoFlags('2026-07-02'); // 25/06 + 7 = 02/07 (no limite)
    expect(daysUntil('2026-07-02')).toBe(URGENT_DAYS);
    expect(limite.urgente).toBe(true);
    expect(limite.badge).toBe(`Encerra em ${URGENT_DAYS} dias`);
  });

  it('não marca urgência além do limite nem para prazo já vencido', () => {
    expect(prazoFlags('2026-07-03').urgente).toBe(false); // 8 dias
    expect(prazoFlags('2026-06-24').urgente).toBe(false); // ontem
  });

  it('trata prazo ausente', () => {
    const sem = prazoFlags(null);
    expect(sem.fmt).toBe('Não informado');
    expect(sem.urgente).toBe(false);
    expect(sem.badge).toBe('');
  });
});
