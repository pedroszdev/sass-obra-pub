import { CertidaoTipo } from '../company-profile/certidao-tipo.enum';

// Agenda de prazos (BACKLOG T-91). Hoje o modelo de dados só tem dois prazos
// reais: a ENTREGA da proposta (Edital.prazoProposta, dos editais salvos ou com
// proposta) e o VENCIMENTO de certidão (Certidao.dataValidade). Sessão de
// disputa / impugnação / visita técnica não são captadas (exigiriam extração por
// IA do texto do edital) — ficam fora até existir essa fonte.
export type AgendaTipo = 'entrega_proposta' | 'certidao_vencimento';

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

  return eventos.sort(
    (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
  );
}
