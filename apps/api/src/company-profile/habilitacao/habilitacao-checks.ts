import { CertidaoTipo } from '../certidao-tipo.enum';

// Checagens puras do perfil do empreiteiro (T-40/T-41) usadas tanto pela
// prontidão genérica (T-45, catálogo fixo) quanto pelo diagnóstico específico
// por edital (T-51, exigências reais do edital). Determinísticas (recebem `now`)
// — o backend é o dono do diagnóstico e calcula a validade aqui.

export type ProntidaoStatus = 'atendido' | 'atencao' | 'nao_atendido';

export interface CheckResult {
  status: ProntidaoStatus;
  /** Texto curto explicando o status (ex.: "Válida até 31/12/2026"). */
  motivo: string;
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

function fmtBRL(v: number): string {
  return (
    'R$ ' +
    v
      .toFixed(2)
      .replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  );
}

function diasAteValidade(dataValidade: string, now: Date): number {
  const target = new Date(`${dataValidade.slice(0, 10)}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function avaliarCertidao(
  certidaoTipo: CertidaoTipo,
  exigeValidade: boolean,
  input: ProntidaoInput,
  now: Date,
): CheckResult {
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

export function avaliarRegistro(input: ProntidaoInput): CheckResult {
  const tem =
    !!input.registroProfissionalTipo?.trim() &&
    !!input.registroProfissionalNumero?.trim();
  return tem
    ? { status: 'atendido', motivo: 'CREA/CAU informado' }
    : { status: 'nao_atendido', motivo: 'Não informado' };
}

export function avaliarCapacidadeTecnica(input: ProntidaoInput): CheckResult {
  if (input.atestadosCount <= 0) {
    return { status: 'nao_atendido', motivo: 'Nenhum atestado cadastrado' };
  }
  return {
    status: 'atendido',
    motivo:
      input.atestadosCount === 1
        ? '1 atestado cadastrado'
        : `${input.atestadosCount} atestados cadastrados`,
  };
}

// `valorMinimo` (T-51): quando o edital exige um capital/PL mínimo, compara com
// o do perfil. Sem mínimo (T-45), basta estar informado e > 0.
export function avaliarCapitalSocial(
  input: ProntidaoInput,
  valorMinimo?: number | null,
): CheckResult {
  const cap = input.capitalSocial;
  if (cap == null || cap <= 0) {
    return { status: 'nao_atendido', motivo: 'Capital social não informado' };
  }
  if (valorMinimo != null && valorMinimo > 0 && cap < valorMinimo) {
    return {
      status: 'nao_atendido',
      motivo: `Capital ${fmtBRL(cap)} abaixo do mínimo exigido (${fmtBRL(valorMinimo)})`,
    };
  }
  return {
    status: 'atendido',
    motivo:
      valorMinimo != null && valorMinimo > 0
        ? `Capital atende o mínimo (${fmtBRL(valorMinimo)})`
        : 'Capital social informado',
  };
}
