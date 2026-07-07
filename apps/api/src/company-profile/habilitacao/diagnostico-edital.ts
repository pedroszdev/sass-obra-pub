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
import { guiaRegularizacao, RegularizacaoInfo } from './regularizacao-catalog';

// Motor de diagnóstico ESPECÍFICO por edital (BACKLOG T-51): cruza as exigências
// que a IA extraiu DAQUELE edital (T-49) com o perfil do empreiteiro (T-40),
// reusando as checagens da prontidão genérica (T-45). Puro e determinístico.
// Diferente da T-45: itera só o que o edital exige (não o catálogo fixo) e usa
// o capital/PL mínimo do edital quando a IA o extrai.

// `indefinido` (T-116b): o diagnóstico não conseguiu verificar NENHUM item no
// perfil (todas as exigências caíram em observações) — não é honesto dizer
// "apto". Fica de fora do filtro "só onde estou apto" (T-53).
export type Veredito = 'apto' | 'quase' | 'nao_apto' | 'indefinido';

export interface DiagnosticoItem {
  key: string;
  label: string;
  status: ProntidaoStatus;
  motivo: string;
  /** Guia de regularização (T-111): onde/como emitir. Presente só em pendência
   *  de certidão/registro (status ≠ atendido). */
  regularizacao?: RegularizacaoInfo;
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
  /** Dias até o prazo de proposta do edital (T-111): cruza a urgência com as
   *  pendências. null quando o edital não informa prazo. Negativo = já passou. */
  diasAtePrazo: number | null;
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

// Resolve o capital/PL mínimo exigido pelo edital (T-116a). Prioriza o valor em
// reais; se só houver percentual sobre o estimado, cruza com o valorEstimado do
// edital. Se exige percentual mas o estimado é desconhecido → indeterminado
// (vira atenção, não falso "apto").
function resolverCapitalMinimo(
  cap: ExigenciasHabilitacao['capitalSocial'],
  valorEstimado: number | null,
): { valorMinimo: number | null; indeterminado: boolean } {
  if (cap.valorMinimoReais != null && cap.valorMinimoReais > 0) {
    return { valorMinimo: cap.valorMinimoReais, indeterminado: false };
  }
  const pct = cap.percentualSobreEstimado;
  if (pct != null && pct > 0) {
    if (valorEstimado != null && valorEstimado > 0) {
      return { valorMinimo: (pct / 100) * valorEstimado, indeterminado: false };
    }
    return { valorMinimo: null, indeterminado: true };
  }
  return { valorMinimo: null, indeterminado: false };
}

// Dias corridos de `now` até o prazo (T-111). Ceil: qualquer fração de dia
// restante conta como +1 ("falta 1 dia"). Negativo = prazo já passou.
function calcularDiasAtePrazo(prazo: Date | null, now: Date): number | null {
  if (!prazo) return null;
  return Math.ceil((prazo.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Cruza as exigências de UM edital com o perfil. Veredito + o que falta.
 * `valorEstimado` (4º arg, após `now` p/ não quebrar chamadas posicionais) é o
 * valor estimado do edital — usado para o capital mínimo em % (T-116a).
 * `prazoProposta` (5º arg) alimenta o `diasAtePrazo` do guia de regularização
 * (T-111); as chamadas que só querem o veredito podem omiti-lo.
 */
export function diagnosticarEdital(
  exigencias: ExigenciasHabilitacao,
  input: ProntidaoInput,
  now: Date = new Date(),
  valorEstimado: number | null = null,
  prazoProposta: Date | null = null,
): DiagnosticoEditalResult {
  const itens: DiagnosticoItem[] = [];
  const observacoes: string[] = [];

  // Dedup por tipo (T-116c): tipo de certidão repetido na saída da IA não pode
  // contar 2x no percentual nem gerar keys duplicadas no front.
  const tiposVistos = new Set<ExigenciaCertidaoTipo>();
  for (const c of exigencias.certidoes) {
    if (!c.exigida) continue;
    // OUTRA não tem como casar com os tipos do perfil — vira observação (várias
    // OUTRA distintas são válidas, por isso não entram no dedup).
    if (c.tipo === CertidaoTipo.OUTRA) {
      observacoes.push(
        c.trecho
          ? `Exige outra certidão: "${c.trecho}" — confira manualmente.`
          : 'Exige outra certidão — confira manualmente.',
      );
      continue;
    }
    if (tiposVistos.has(c.tipo)) continue;
    tiposVistos.add(c.tipo);
    const avaliacao = avaliarCertidao(c.tipo, true, input, now);
    itens.push({
      key: `certidao:${c.tipo}`,
      label: CERTIDAO_LABEL[c.tipo],
      ...avaliacao,
      // Pendência → onde emitir (T-111). c.tipo aqui nunca é OUTRA (tratada acima).
      ...(avaliacao.status !== 'atendido'
        ? { regularizacao: guiaRegularizacao(c.tipo, input.uf) }
        : {}),
    });
  }

  if (exigencias.registroConselho.exigido) {
    const avaliacao = avaliarRegistro(input);
    itens.push({
      key: 'registro_conselho',
      label: 'Registro no conselho profissional (CREA/CAU)',
      ...avaliacao,
      ...(avaliacao.status !== 'atendido'
        ? {
            regularizacao: guiaRegularizacao(
              CertidaoTipo.REGISTRO_CONSELHO,
              input.uf,
            ),
          }
        : {}),
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
    const { valorMinimo, indeterminado } = resolverCapitalMinimo(
      exigencias.capitalSocial,
      valorEstimado,
    );
    itens.push({
      key: 'capital_social',
      label: 'Capital social / patrimônio líquido',
      ...avaliarCapitalSocial(input, valorMinimo, indeterminado),
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

  // Sem NENHUM item verificável no perfil (só observações) → não é honesto
  // dizer "apto" (T-116b): veredito indefinido + nota explicando.
  if (total === 0) {
    observacoes.unshift(
      'Nenhuma exigência deste edital pôde ser verificada no seu perfil — confira o edital manualmente.',
    );
  }

  const veredito: Veredito =
    total === 0
      ? 'indefinido'
      : naoAtendidos > 0
        ? 'nao_apto'
        : atencao > 0
          ? 'quase'
          : 'apto';

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
    diasAtePrazo: calcularDiasAtePrazo(prazoProposta, now),
  };
}
