import { EditalListItem } from '../../editais/dto/edital-search-response';
import { ExigenciasStatus } from '../../editais/exigencias/edital-exigencias.entity';
import {
  ExigenciaCertidaoTipo,
  ExigenciasHabilitacao,
} from '../../editais/exigencias/exigencias.types';
import { CertidaoTipo } from '../certidao-tipo.enum';
import {
  avaliarCapacidadeTecnica,
  avaliarCapitalSocial,
  avaliarCertidao,
  avaliarRegistro,
  ProntidaoInput,
  ProntidaoStatus,
} from './habilitacao-checks';

// Motor de diagnóstico ESPECÍFICO por edital (BACKLOG T-51): cruza as exigências
// que a IA extraiu DAQUELE edital (T-49) com o perfil do empreiteiro (T-40),
// reusando as checagens da prontidão genérica (T-45). Puro e determinístico.
// Diferente da T-45: itera só o que o edital exige (não o catálogo fixo) e usa
// o capital/PL mínimo do edital quando a IA o extrai.

export type Veredito = 'apto' | 'quase' | 'nao_apto';

export interface DiagnosticoItem {
  key: string;
  label: string;
  status: ProntidaoStatus;
  motivo: string;
}

export interface DiagnosticoEditalResult {
  veredito: Veredito;
  itens: DiagnosticoItem[];
  total: number;
  atendidos: number;
  atencao: number;
  naoAtendidos: number;
  /** atendidos / total, arredondado (0–100). */
  percentual: number;
  /** Rótulos dos itens não atendidos — "o que falta para esta obra". */
  faltam: string[];
  /** Exigências do edital que não dá para checar no perfil (informativas). */
  observacoes: string[];
}

// Resposta do endpoint (T-51). `diagnostico` é null quando o edital ainda não
// tem exigências extraídas (indisponível/erro) — a tela (T-52) explica o porquê.
export interface DiagnosticoEditalResponse {
  editalId: string;
  exigenciasStatus: ExigenciasStatus;
  atualizadoEm: Date;
  diagnostico: DiagnosticoEditalResult | null;
}

// Item da busca por aptidão (T-53): o edital + o veredito do usuário para ele.
export interface EditalAptoItem extends EditalListItem {
  veredito: Veredito;
}

export interface EditaisAptosResult {
  data: EditalAptoItem[];
  total: number;
  page: number;
  pageSize: number;
}

const CERTIDAO_LABEL: Record<ExigenciaCertidaoTipo, string> = {
  [CertidaoTipo.CND_FEDERAL]: 'Regularidade com a Fazenda Federal (CND)',
  [CertidaoTipo.FGTS]: 'Regularidade com o FGTS (CRF)',
  [CertidaoTipo.TRABALHISTA]: 'Regularidade trabalhista (CNDT)',
  [CertidaoTipo.ESTADUAL]: 'Regularidade com a Fazenda Estadual',
  [CertidaoTipo.MUNICIPAL]: 'Regularidade com a Fazenda Municipal',
  [CertidaoTipo.FALENCIA]: 'Negativa de falência / recuperação judicial',
  [CertidaoTipo.OUTRA]: 'Outra certidão',
};

/** Cruza as exigências de UM edital com o perfil. Veredito + o que falta. */
export function diagnosticarEdital(
  exigencias: ExigenciasHabilitacao,
  input: ProntidaoInput,
  now: Date = new Date(),
): DiagnosticoEditalResult {
  const itens: DiagnosticoItem[] = [];
  const observacoes: string[] = [];

  for (const c of exigencias.certidoes) {
    if (!c.exigida) continue;
    // OUTRA não tem como casar com os tipos do perfil — vira observação.
    if (c.tipo === CertidaoTipo.OUTRA) {
      observacoes.push(
        c.trecho
          ? `Exige outra certidão: "${c.trecho}" — confira manualmente.`
          : 'Exige outra certidão — confira manualmente.',
      );
      continue;
    }
    itens.push({
      key: `certidao:${c.tipo}`,
      label: CERTIDAO_LABEL[c.tipo],
      ...avaliarCertidao(c.tipo, true, input, now),
    });
  }

  if (exigencias.registroConselho.exigido) {
    itens.push({
      key: 'registro_conselho',
      label: 'Registro no conselho profissional (CREA/CAU)',
      ...avaliarRegistro(input),
    });
  }

  if (exigencias.capacidadeTecnica.exigida) {
    itens.push({
      key: 'capacidade_tecnica',
      label: 'Atestado de capacidade técnica',
      ...avaliarCapacidadeTecnica(input),
    });
  }

  if (exigencias.capitalSocial.exigido) {
    itens.push({
      key: 'capital_social',
      label: 'Capital social / patrimônio líquido',
      ...avaliarCapitalSocial(input, exigencias.capitalSocial.valorMinimoReais),
    });
  }

  // Itens sem campo no perfil — informativos (não pontuam).
  if (exigencias.garantia.exigida) {
    observacoes.push(
      'Exige garantia (de proposta e/ou contratual) — providencie na fase de proposta.',
    );
  }
  for (const o of exigencias.outrosRequisitos) {
    if (o.trim()) observacoes.push(o);
  }

  const atendidos = itens.filter((i) => i.status === 'atendido').length;
  const atencao = itens.filter((i) => i.status === 'atencao').length;
  const naoAtendidos = itens.filter((i) => i.status === 'nao_atendido').length;
  const total = itens.length;
  const faltam = itens
    .filter((i) => i.status === 'nao_atendido')
    .map((i) => i.label);

  const veredito: Veredito =
    naoAtendidos > 0 ? 'nao_apto' : atencao > 0 ? 'quase' : 'apto';

  return {
    veredito,
    itens,
    total,
    atendidos,
    atencao,
    naoAtendidos,
    percentual: total === 0 ? 0 : Math.round((atendidos / total) * 100),
    faltam,
    observacoes,
  };
}
