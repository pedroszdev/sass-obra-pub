import { CertidaoTipo } from '../company-profile/certidao-tipo.enum';
import { guiaRegularizacao } from '../company-profile/habilitacao/regularizacao-catalog';
import { PropostaStatus } from '../propostas/proposta-status.enum';

// Central de notificações (BACKLOG T-90). Alertas DERIVADOS do estado real (sem
// tabela de eventos): certidão vencendo, prazo de entrega próximo, resumo IA
// pronto e resultado de proposta. Cada alerta carrega um `data` PASSADO (quando
// passou a valer) — o sino conta os com data posterior à última visita do
// usuário. "nova obra apta" fica como follow-up (precisa de recência × veredito).
export type AlertaCat = 'obra' | 'prazo' | 'documento' | 'ia' | 'orcamento';

export interface AlertaItem {
  id: string;
  cat: AlertaCat;
  titulo: string;
  detalhe: string;
  /** Instante de relevância (ISO, passado). Base do "não lido". */
  data: string;
  novo: boolean;
  /** Para onde o card leva. */
  href: string;
}

// Entradas já carregadas do banco (o service faz as queries).
export interface AlertasInput {
  certidoes: {
    tipo: CertidaoTipo;
    descricao: string | null;
    dataValidade: string | null;
    updatedAt: Date;
  }[];
  prazos: {
    editalId: string;
    objeto: string;
    prazoProposta: Date;
    dataPublicacao: Date;
    propostaId: string | null;
  }[];
  resumos: { editalId: string; objeto: string; updatedAt: Date }[];
  resultados: {
    propostaId: string;
    titulo: string;
    status: PropostaStatus;
    updatedAt: Date;
  }[];
}

const CERTIDAO_TIPO_LABEL: Record<CertidaoTipo, string> = {
  [CertidaoTipo.CND_FEDERAL]: 'CND Federal',
  [CertidaoTipo.FGTS]: 'FGTS (CRF)',
  [CertidaoTipo.TRABALHISTA]: 'CNDT (Trabalhista)',
  [CertidaoTipo.ESTADUAL]: 'Regularidade Estadual',
  [CertidaoTipo.MUNICIPAL]: 'Regularidade Municipal',
  [CertidaoTipo.FALENCIA]: 'Negativa de Falência',
  [CertidaoTipo.REGISTRO_CONSELHO]: 'Registro no Conselho',
  [CertidaoTipo.OUTRA]: 'Certidão',
};

const DIA_MS = 86_400_000;
// Janelas de relevância.
const CERTIDAO_AVISO_DIAS = 30; // avisa quando faltam ≤30 dias (ou já venceu)
const PRAZO_AVISO_DIAS = 14; // avisa entrega que fecha em ≤14 dias

// Dias inteiros de `now` até `date` (date-only no fuso local). Negativo = passou.
function diasAte(dataValidade: string, now: Date): number {
  const [y, m, d] = dataValidade.slice(0, 10).split('-').map(Number);
  const alvo = Date.UTC(y, m - 1, d);
  const hoje = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((alvo - hoje) / DIA_MS);
}

function certidaoTitulo(tipo: CertidaoTipo, descricao: string | null): string {
  if (tipo === CertidaoTipo.OUTRA && descricao?.trim()) return descricao.trim();
  return CERTIDAO_TIPO_LABEL[tipo];
}

// Monta a central de alertas (puro/testável; `now` injetado, §3.3). Ordena por
// data decrescente (mais recente primeiro). `novo` = data > vistoEm.
export function construirAlertas(
  input: AlertasInput,
  vistoEm: Date | null,
  now: Date,
): AlertaItem[] {
  type Bruto = Omit<AlertaItem, 'data' | 'novo'> & { data: Date };
  const brutos: Bruto[] = [];

  // Certidões vencendo/vencidas (documento).
  for (const c of input.certidoes) {
    if (!c.dataValidade) continue;
    const dias = diasAte(c.dataValidade, now);
    if (dias > CERTIDAO_AVISO_DIAS) continue;
    const nome = certidaoTitulo(c.tipo, c.descricao);
    // Guia de regularização (T-111): se há portal nacional de emissão (trio
    // federal), o card leva direto pra lá; senão, ao cofre (/documentos).
    const guia =
      c.tipo === CertidaoTipo.OUTRA ? null : guiaRegularizacao(c.tipo, null);
    brutos.push({
      id: `documento:${c.tipo}:${c.dataValidade}`,
      cat: 'documento',
      titulo:
        dias < 0
          ? `${nome} vencida`
          : dias === 0
            ? `${nome} vence hoje`
            : `${nome} vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`,
      detalhe: guia?.url
        ? `Renove em ${guia.orgao}.`
        : 'Renove pra continuar habilitado.',
      data: c.updatedAt,
      href: guia?.url ?? '/documentos',
    });
  }

  // Prazos de entrega próximos (prazo).
  for (const p of input.prazos) {
    const ms = p.prazoProposta.getTime() - now.getTime();
    if (ms < 0 || ms > PRAZO_AVISO_DIAS * DIA_MS) continue;
    const dias = Math.ceil(ms / DIA_MS);
    brutos.push({
      id: `prazo:${p.editalId}`,
      cat: 'prazo',
      titulo:
        dias <= 1 ? 'Proposta fecha amanhã' : `Proposta fecha em ${dias} dias`,
      detalhe: p.objeto,
      data: p.dataPublicacao,
      href: p.propostaId
        ? `/orcamentos/${p.propostaId}`
        : `/editais/${p.editalId}`,
    });
  }

  // Resumo IA pronto (ia).
  for (const r of input.resumos) {
    brutos.push({
      id: `ia:${r.editalId}`,
      cat: 'ia',
      titulo: 'Resumo do edital pronto',
      detalhe: r.objeto,
      data: r.updatedAt,
      href: `/editais/${r.editalId}`,
    });
  }

  // Resultado de proposta (orcamento).
  for (const r of input.resultados) {
    brutos.push({
      id: `orcamento:${r.propostaId}`,
      cat: 'orcamento',
      titulo:
        r.status === PropostaStatus.GANHOU
          ? 'Resultado: você ganhou'
          : 'Resultado: não ganhou desta vez',
      detalhe: r.titulo,
      data: r.updatedAt,
      href: `/orcamentos/${r.propostaId}`,
    });
  }

  return brutos
    .sort((a, b) => b.data.getTime() - a.data.getTime())
    .map((b) => ({
      ...b,
      data: b.data.toISOString(),
      novo: vistoEm == null ? true : b.data.getTime() > vistoEm.getTime(),
    }));
}
