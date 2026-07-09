import { QualificacaoBase } from '../../editais/exigencias/exigencias.types';
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
  /** Patrimônio líquido da empresa (T-141). Editais costumam exigir PL, não
   *  capital social — e são números diferentes. null = não informado. */
  patrimonioLiquido: number | null;
  registroProfissionalTipo: string | null;
  registroProfissionalNumero: string | null;
  /** UF da sede do empreiteiro — resolve o órgão emissor por UF (Sefaz/TJ/CREA)
   *  no guia de regularização (T-111). null quando desconhecida. */
  uf: string | null;
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
  // Compara datas em UTC — determinístico e sem off-by-one se o fuso do servidor
  // mudar (T-110). A validade é uma data-calendário (YYYY-MM-DD); a meia-noite
  // UTC dela vs a meia-noite UTC de hoje.
  const target = Date.parse(`${dataValidade.slice(0, 10)}T00:00:00Z`);
  const hoje = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((target - hoje) / 86_400_000);
}

// Preferência entre status: atendido > atencao > nao_atendido. Usado para
// escolher o melhor resultado entre várias certidões do mesmo tipo (T-116c).
const STATUS_RANK: Record<ProntidaoStatus, number> = {
  atendido: 3,
  atencao: 2,
  nao_atendido: 1,
};

// Avalia UMA certidão pela data de validade. Sem data → atencao (não dá pra
// afirmar que está válida, mas existe).
function avaliarValidade(dataValidade: string | null, now: Date): CheckResult {
  if (!dataValidade) {
    return { status: 'atencao', motivo: 'Sem data de validade informada' };
  }
  const dias = diasAteValidade(dataValidade, now);
  if (dias < 0) {
    return {
      status: 'nao_atendido',
      motivo: `Vencida em ${fmtDataBR(dataValidade)} — renove`,
    };
  }
  if (dias <= PRONTIDAO_VENCENDO_DIAS) {
    const quando =
      dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
    return {
      status: 'atencao',
      motivo: `Vence ${quando} (${fmtDataBR(dataValidade)})`,
    };
  }
  return {
    status: 'atendido',
    motivo: `Válida até ${fmtDataBR(dataValidade)}`,
  };
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

  // Avalia CADA certidão do tipo e fica com o melhor status — assim uma vencida
  // não "esconde" outra sem data do mesmo tipo (T-116c). Empate de status →
  // validade mais distante (motivo mais favorável/informativo).
  let melhor: { check: CheckResult; validade: string | null } | null = null;
  for (const c of doTipo) {
    const check = avaliarValidade(c.dataValidade, now);
    const rankMelhor = melhor ? STATUS_RANK[melhor.check.status] : -1;
    const desempate =
      melhor != null &&
      STATUS_RANK[check.status] === rankMelhor &&
      (c.dataValidade ?? '') > (melhor.validade ?? '');
    if (melhor == null || STATUS_RANK[check.status] > rankMelhor || desempate) {
      melhor = { check, validade: c.dataValidade };
    }
  }
  return melhor!.check;
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
// `minimoIndeterminado` (T-116a): o edital exige um mínimo em % do valor
// estimado, mas o estimado não está disponível (ex.: orçamento sigiloso, T-115)
// — não dá pra afirmar que atende, então vira atenção em vez de falso "apto".
//
// `base` (T-141): o edital exige o mínimo sobre o CAPITAL SOCIAL ou sobre o
// PATRIMÔNIO LÍQUIDO — números diferentes da empresa. Comparar o PL exigido
// contra o capital social informado daria um "apto" falso. Ausente (cache antigo,
// §3.4) → capital social, o comportamento histórico.
export function avaliarCapitalSocial(
  input: ProntidaoInput,
  valorMinimo?: number | null,
  minimoIndeterminado = false,
  base: QualificacaoBase = 'CAPITAL_SOCIAL',
): CheckResult {
  const ehPl = base === 'PATRIMONIO_LIQUIDO';
  const nome = ehPl ? 'Patrimônio líquido' : 'Capital social';
  const cap = ehPl ? input.patrimonioLiquido : input.capitalSocial;
  if (cap == null || cap <= 0) {
    return { status: 'nao_atendido', motivo: `${nome} não informado` };
  }
  if (minimoIndeterminado) {
    return {
      status: 'atencao',
      motivo: `Exige ${nome.toLowerCase()} mínimo em % do valor estimado, que não está disponível — confira manualmente`,
    };
  }
  if (valorMinimo != null && valorMinimo > 0 && cap < valorMinimo) {
    return {
      status: 'nao_atendido',
      motivo: `${nome} ${fmtBRL(cap)} abaixo do mínimo exigido (${fmtBRL(valorMinimo)})`,
    };
  }
  return {
    status: 'atendido',
    motivo:
      valorMinimo != null && valorMinimo > 0
        ? `${nome} atende o mínimo (${fmtBRL(valorMinimo)})`
        : `${nome} informado`,
  };
}
