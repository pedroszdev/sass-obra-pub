import { CertidaoTipo } from '../company-profile/certidao-tipo.enum';
import { parseDataChave } from './data-chave-parser';

// Agenda de prazos (BACKLOG T-91/T-112). Prazos reais: ENTREGA da proposta
// (Edital.prazoProposta), VENCIMENTO de certidão (Certidao.dataValidade) e as
// DATAS-CHAVE do edital (sessão/visita técnica/impugnação) que a IA já extraiu
// no resumo (T-112) — parseadas best-effort a partir de texto livre.
export type AgendaTipo =
  | 'entrega_proposta'
  | 'certidao_vencimento'
  | 'data_edital';

export interface AgendaEvento {
  tipo: AgendaTipo;
  // Instante do prazo (ISO). O front calcula dias restantes/urgência no fuso de
  // Brasília com o helper que já usa nas outras telas.
  data: string;
  titulo: string;
  subtitulo: string | null;
  editalId: string | null;
  propostaId: string | null;
}

// Entradas puras (já carregadas do banco pelo service).
export interface AgendaEditalInput {
  id: string;
  objeto: string;
  municipioNome: string;
  uf: string;
  prazoProposta: Date | null;
  // Proposta do usuário para este edital (se houver) — linka o card à proposta.
  propostaId: string | null;
}

export interface AgendaCertidaoInput {
  tipo: CertidaoTipo;
  descricao: string | null;
  dataValidade: string | null;
}

// Data-chave do edital já analisado (T-112): o evento + o texto livre da IA +
// o edital de origem (para o título/subtítulo e o link do card).
export interface AgendaDataChaveInput {
  editalId: string;
  objeto: string;
  municipioNome: string;
  uf: string;
  /** Ex.: "Sessão de abertura", "Visita técnica". */
  evento: string;
  /** Texto livre da IA (ex.: "12/07/2026 às 09h") — parseado best-effort. */
  quando: string;
}

// Rótulos pt-BR das certidões para o título do evento (§5).
const CERTIDAO_TIPO_LABEL: Record<CertidaoTipo, string> = {
  [CertidaoTipo.CND_FEDERAL]: 'CND Federal',
  [CertidaoTipo.FGTS]: 'FGTS (CRF)',
  [CertidaoTipo.TRABALHISTA]: 'CNDT (Trabalhista)',
  [CertidaoTipo.ESTADUAL]: 'Regularidade Estadual',
  [CertidaoTipo.MUNICIPAL]: 'Regularidade Municipal',
  [CertidaoTipo.FALENCIA]: 'Negativa de Falência',
  [CertidaoTipo.REGISTRO_CONSELHO]: 'Registro no Conselho (CREA/CAU)',
  [CertidaoTipo.OUTRA]: 'Certidão',
};

function certidaoTitulo(c: AgendaCertidaoInput): string {
  if (c.tipo === CertidaoTipo.OUTRA && c.descricao?.trim()) {
    return c.descricao.trim();
  }
  return CERTIDAO_TIPO_LABEL[c.tipo];
}

// Monta a agenda unificada e ordenada (puro/testável; `now` injetado, §3.3).
// Regras: entrega de proposta só entra se ainda está por vir (>= now) — prazo já
// vencido não é acionável; certidão entra sempre que tem validade (vencida
// importa: precisa renovar). Ordena por data crescente.
export function montarAgenda(
  editais: AgendaEditalInput[],
  certidoes: AgendaCertidaoInput[],
  now: Date,
  datasChave: AgendaDataChaveInput[] = [],
): AgendaEvento[] {
  const eventos: AgendaEvento[] = [];

  for (const e of editais) {
    if (!e.prazoProposta) continue;
    if (e.prazoProposta.getTime() < now.getTime()) continue;
    eventos.push({
      tipo: 'entrega_proposta',
      data: e.prazoProposta.toISOString(),
      titulo: e.objeto,
      subtitulo: `${e.municipioNome}/${e.uf}`,
      editalId: e.id,
      propostaId: e.propostaId,
    });
  }

  for (const c of certidoes) {
    if (!c.dataValidade) continue;
    eventos.push({
      tipo: 'certidao_vencimento',
      data: new Date(`${c.dataValidade}T00:00:00`).toISOString(),
      titulo: certidaoTitulo(c),
      subtitulo: 'Vencimento de certidão',
      editalId: null,
      propostaId: null,
    });
  }

  // Datas-chave do edital (T-112): só entram as parseáveis e ainda por vir. As
  // não-parseáveis ("facultativa", "a definir") caem fora aqui e seguem só no
  // Resumo IA (nada se perde).
  for (const d of datasChave) {
    const data = parseDataChave(d.quando);
    if (!data || data.getTime() < now.getTime()) continue;
    eventos.push({
      tipo: 'data_edital',
      data: data.toISOString(),
      titulo: d.evento,
      subtitulo: d.objeto,
      editalId: d.editalId,
      propostaId: null,
    });
  }

  return eventos.sort(
    (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
  );
}
