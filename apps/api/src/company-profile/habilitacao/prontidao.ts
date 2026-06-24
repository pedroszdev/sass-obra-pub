import { CertidaoTipo } from '../certidao-tipo.enum';
import {
  REQUISITOS_HABILITACAO_OBRA,
  RequisitoCategoria,
  RequisitoHabilitacao,
} from './requisitos-catalog';

// Motor de prontidão genérica (BACKLOG T-45): cruza o perfil do empreiteiro
// (T-40/T-41) com o catálogo de requisitos (T-44) e diz, por item, se atende.
// Lógica PURA e determinística (recebe `now`) — fácil de testar. O backend é o
// dono do diagnóstico, então a validade é calculada aqui.

export type ProntidaoStatus = 'atendido' | 'atencao' | 'nao_atendido';

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

// Dados do perfil relevantes para o diagnóstico (extraídos pelo service).
export interface ProntidaoInput {
  certidoes: Array<{ tipo: CertidaoTipo; dataValidade: string | null }>;
  atestadosCount: number;
  capitalSocial: number | null;
  registroProfissionalTipo: string | null;
  registroProfissionalNumero: string | null;
}

// Janela (dias) em que a certidão ainda é válida mas conta como "vence em breve".
export const PRONTIDAO_VENCENDO_DIAS = 30;

function fmtDataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function diasAteValidade(dataValidade: string, now: Date): number {
  const target = new Date(`${dataValidade.slice(0, 10)}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function avaliarCertidao(
  certidaoTipo: CertidaoTipo,
  exigeValidade: boolean,
  input: ProntidaoInput,
  now: Date,
): { status: ProntidaoStatus; motivo: string } {
  const doTipo = input.certidoes.filter((c) => c.tipo === certidaoTipo);
  if (doTipo.length === 0) {
    return { status: 'nao_atendido', motivo: 'Não cadastrada' };
  }
  if (!exigeValidade) {
    return { status: 'atendido', motivo: 'Cadastrada' };
  }

  const comValidade = doTipo.filter((c) => c.dataValidade);
  if (comValidade.length === 0) {
    return { status: 'atencao', motivo: 'Sem data de validade informada' };
  }

  // Entre várias do mesmo tipo, a de validade mais distante é a "melhor".
  const melhor = comValidade.reduce((a, b) =>
    (a.dataValidade ?? '') >= (b.dataValidade ?? '') ? a : b,
  );
  const validade = melhor.dataValidade as string;
  const dias = diasAteValidade(validade, now);
  if (dias < 0) {
    return {
      status: 'nao_atendido',
      motivo: `Vencida em ${fmtDataBR(validade)} — renove`,
    };
  }
  if (dias <= PRONTIDAO_VENCENDO_DIAS) {
    const quando =
      dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
    return {
      status: 'atencao',
      motivo: `Vence ${quando} (${fmtDataBR(validade)})`,
    };
  }
  return { status: 'atendido', motivo: `Válida até ${fmtDataBR(validade)}` };
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
    case 'certidao': {
      const r = avaliarCertidao(
        check.certidaoTipo,
        check.exigeValidade,
        input,
        now,
      );
      return { ...base, ...r };
    }
    case 'registro_conselho': {
      const tem =
        !!input.registroProfissionalTipo?.trim() &&
        !!input.registroProfissionalNumero?.trim();
      return tem
        ? { ...base, status: 'atendido', motivo: 'CREA/CAU informado' }
        : { ...base, status: 'nao_atendido', motivo: 'Não informado' };
    }
    case 'capacidade_tecnica': {
      return input.atestadosCount > 0
        ? {
            ...base,
            status: 'atendido',
            motivo:
              input.atestadosCount === 1
                ? '1 atestado cadastrado'
                : `${input.atestadosCount} atestados cadastrados`,
          }
        : {
            ...base,
            status: 'nao_atendido',
            motivo: 'Nenhum atestado cadastrado',
          };
    }
    case 'capital_social': {
      return input.capitalSocial != null && input.capitalSocial > 0
        ? { ...base, status: 'atendido', motivo: 'Capital social informado' }
        : {
            ...base,
            status: 'nao_atendido',
            motivo: 'Capital social não informado',
          };
    }
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
