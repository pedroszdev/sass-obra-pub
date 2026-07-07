// Parser best-effort das datas-chave do edital (BACKLOG T-112). A IA extrai
// `DataChave.quando` como STRING LIVRE ("12/07/2026 às 09h", "facultativa",
// "a definir") — não data estruturada. Este parser determinístico e puro tenta
// achar uma data BR (dd/mm/aaaa) + hora opcional; o que não casar volta null e
// segue aparecendo só no Resumo IA (nada se perde). Sem IA (§3.4).
//
// Fuso: a hora do edital é hora de Brasília (parede). Montamos o instante com
// offset -03:00 explícito para o ISO ficar correto independentemente do TZ do
// servidor (Render roda em UTC) — o front converte de volta pra Brasília.

const BRASILIA_OFFSET = '-03:00';

// dd/mm/aaaa (aceita separador / . ou -), com hora opcional depois.
// Hora: "às 9h", "09:00", "9h30", "09h", "9 h" → capturamos hora e minuto.
const DATA_RE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/;
const HORA_RE = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i;

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

// Devolve o instante da data-chave, ou null se `quando` não tem data parseável
// ou é uma data inválida (ex.: 32/13/2026).
export function parseDataChave(quando: string): Date | null {
  if (!quando) return null;
  const mData = DATA_RE.exec(quando);
  if (!mData) return null;

  const dia = Number(mData[1]);
  const mes = Number(mData[2]);
  const ano = Number(mData[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  // Hora: só consideramos o que vier DEPOIS da data (evita casar o dia como hora).
  // Válida só se h<=23 e min<=59; hora fora do intervalo é ignorada (cai no
  // fim-do-dia, como se não houvesse hora).
  const resto = quando.slice(mData.index + mData[0].length);
  const mHora = HORA_RE.exec(resto);
  let horaValida: { h: number; min: number } | null = null;
  if (mHora) {
    const h = Number(mHora[1]);
    const min = mHora[2] ? Number(mHora[2]) : 0;
    if (h <= 23 && min <= 59) horaValida = { h, min };
  }
  // Sem hora (ou hora inválida) → fim do dia, para o evento não sumir da agenda
  // no próprio dia (uma "visita técnica hoje" precisa ficar visível até a noite).
  const hh = horaValida ? horaValida.h : 23;
  const mm = horaValida ? horaValida.min : 59;

  // Rejeita dia inexistente no mês (31/04, 30/02, 29/02 em ano não-bissexto…).
  if (!diaValido(ano, mes, dia)) return null;

  const iso = `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}T${doisDigitos(hh)}:${doisDigitos(mm)}:00${BRASILIA_OFFSET}`;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

// Meses com 30 dias + fevereiro (com bissexto). Rejeita 31/04, 30/02, 29/02
// em ano não-bissexto etc.
function diaValido(ano: number, mes: number, dia: number): boolean {
  const diasNoMes = [
    31,
    bissexto(ano) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return dia <= diasNoMes[mes - 1];
}

function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}
