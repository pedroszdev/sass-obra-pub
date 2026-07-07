import {
  avaliarCapacidadeTecnica,
  avaliarCapitalSocial,
  avaliarCertidao,
  avaliarRegistro,
  ProntidaoInput,
  ProntidaoStatus,
} from './habilitacao-checks';
import { CertidaoTipo } from '../certidao-tipo.enum';
import {
  guiaRegularizacao,
  RegularizacaoAlvo,
  RegularizacaoInfo,
} from './regularizacao-catalog';
import {
  REQUISITOS_HABILITACAO_OBRA,
  RequisitoCategoria,
  RequisitoCheck,
  RequisitoHabilitacao,
} from './requisitos-catalog';

// Motor de prontidão genérica (BACKLOG T-45): cruza o perfil do empreiteiro
// (T-40/T-41) com o catálogo de requisitos (T-44) e diz, por item, se atende.
// As checagens (validade, registro, atestado, capital) moram em
// `habilitacao-checks.ts`, compartilhadas com o diagnóstico por edital (T-51).

// Re-export para compatibilidade com os importadores existentes.
export { PRONTIDAO_VENCENDO_DIAS } from './habilitacao-checks';
export type { ProntidaoInput, ProntidaoStatus } from './habilitacao-checks';

export interface ProntidaoItem {
  key: string;
  label: string;
  categoria: RequisitoCategoria;
  status: ProntidaoStatus;
  /** Texto curto explicando o status (ex.: "Válida até 31/12/2026"). */
  motivo: string;
  /** Guia de regularização (T-111): presente só em pendência de certidão/registro
   *  (status ≠ atendido) — onde/como emitir. Ausente em item OK ou sem certidão. */
  regularizacao?: RegularizacaoInfo;
}

// Qual certidão o requisito exige emitir — para pendurar o guia (T-111). Capital
// social / capacidade técnica não são certidões a emitir; OUTRA não tem órgão.
function alvoRegularizacao(check: RequisitoCheck): RegularizacaoAlvo | null {
  if (check.tipo === 'certidao') {
    return check.certidaoTipo === CertidaoTipo.OUTRA
      ? null
      : check.certidaoTipo;
  }
  if (check.tipo === 'registro_conselho') {
    return CertidaoTipo.REGISTRO_CONSELHO;
  }
  return null;
}

export interface ProntidaoResult {
  itens: ProntidaoItem[];
  total: number;
  atendidos: number;
  atencao: number;
  naoAtendidos: number;
  /** atendidos / total, arredondado (0–100). */
  percentual: number;
}

function avaliarRequisito(
  requisito: RequisitoHabilitacao,
  input: ProntidaoInput,
  now: Date,
): ProntidaoItem {
  const base = {
    key: requisito.key,
    label: requisito.label,
    categoria: requisito.categoria,
  };
  const check = requisito.check;

  let resultado;
  switch (check.tipo) {
    case 'certidao':
      resultado = avaliarCertidao(
        check.certidaoTipo,
        check.exigeValidade,
        input,
        now,
      );
      break;
    case 'registro_conselho':
      resultado = avaliarRegistro(input);
      break;
    case 'capacidade_tecnica':
      resultado = avaliarCapacidadeTecnica(input);
      break;
    case 'capital_social':
      resultado = avaliarCapitalSocial(input);
      break;
  }

  const item: ProntidaoItem = { ...base, ...resultado };
  // Pendência de certidão/registro → anexa onde emitir (T-111).
  const alvo = alvoRegularizacao(check);
  if (alvo && item.status !== 'atendido') {
    item.regularizacao = guiaRegularizacao(alvo, input.uf);
  }
  return item;
}

/** Cruza o perfil com o catálogo de requisitos e devolve o diagnóstico. */
export function avaliarProntidao(
  input: ProntidaoInput,
  now: Date = new Date(),
): ProntidaoResult {
  const itens = REQUISITOS_HABILITACAO_OBRA.map((r) =>
    avaliarRequisito(r, input, now),
  );
  const atendidos = itens.filter((i) => i.status === 'atendido').length;
  const atencao = itens.filter((i) => i.status === 'atencao').length;
  const naoAtendidos = itens.filter((i) => i.status === 'nao_atendido').length;
  const total = itens.length;
  return {
    itens,
    total,
    atendidos,
    atencao,
    naoAtendidos,
    percentual: total === 0 ? 0 : Math.round((atendidos / total) * 100),
  };
}
