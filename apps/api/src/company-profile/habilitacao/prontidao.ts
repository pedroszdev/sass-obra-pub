import {
  avaliarCapacidadeTecnica,
  avaliarCapitalSocial,
  avaliarCertidao,
  avaliarRegistro,
  ProntidaoInput,
  ProntidaoStatus,
} from './habilitacao-checks';
import {
  REQUISITOS_HABILITACAO_OBRA,
  RequisitoCategoria,
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

  switch (check.tipo) {
    case 'certidao':
      return {
        ...base,
        ...avaliarCertidao(check.certidaoTipo, check.exigeValidade, input, now),
      };
    case 'registro_conselho':
      return { ...base, ...avaliarRegistro(input) };
    case 'capacidade_tecnica':
      return { ...base, ...avaliarCapacidadeTecnica(input) };
    case 'capital_social':
      return { ...base, ...avaliarCapitalSocial(input) };
  }
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
