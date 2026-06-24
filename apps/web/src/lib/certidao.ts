import type { Certidao, CertidaoTipo } from '../types/company-profile';
import { daysUntil } from './format';

// Rótulos em PT-BR dos tipos de certidão (o backend guarda o enum cru).
export const CERTIDAO_TIPO_LABELS: Record<CertidaoTipo, string> = {
  CND_FEDERAL: 'Certidão Negativa de Débitos Federais (CND)',
  FGTS: 'Certificado de Regularidade do FGTS (CRF)',
  TRABALHISTA: 'Certidão Negativa de Débitos Trabalhistas (CNDT)',
  ESTADUAL: 'Certidão de regularidade estadual',
  MUNICIPAL: 'Certidão de regularidade municipal',
  FALENCIA: 'Certidão negativa de falência / recuperação judicial',
  REGISTRO_CONSELHO: 'Registro e quitação CREA/CAU',
  OUTRA: 'Outra',
};

export const CERTIDAO_TIPO_OPTIONS = (
  Object.keys(CERTIDAO_TIPO_LABELS) as CertidaoTipo[]
).map((value) => ({ value, label: CERTIDAO_TIPO_LABELS[value] }));

export type ValidadeStatus = 'valido' | 'vencendo' | 'vencido' | 'sem-validade';

// Janela em que a certidão conta como "vencendo" (perto de vencer).
export const VENCENDO_DIAS = 30;

/** Deriva o status de uma certidão a partir da data de validade. */
export function validadeStatus(dataValidade: string | null): ValidadeStatus {
  if (!dataValidade) return 'sem-validade';
  const dias = daysUntil(dataValidade);
  if (dias < 0) return 'vencido';
  if (dias <= VENCENDO_DIAS) return 'vencendo';
  return 'valido';
}

export const STATUS_META: Record<
  ValidadeStatus,
  { label: string; color: string }
> = {
  valido: { label: 'Válida', color: 'green' },
  vencendo: { label: 'Vence em breve', color: 'orange' },
  vencido: { label: 'Vencida', color: 'red' },
  'sem-validade': { label: 'Sem validade', color: 'gray' },
};

/** Texto curto da validade para o card ("Válida até …", "Venceu em …"). */
export function validadeLabel(dataValidade: string | null): string {
  const status = validadeStatus(dataValidade);
  if (status === 'sem-validade') return 'Sem data de validade';
  const fmt = dataValidade ? dataValidade.slice(0, 10).split('-').reverse().join('/') : '';
  return status === 'vencido' ? `Venceu em ${fmt}` : `Válida até ${fmt}`;
}

/** "1,2 MB" / "340 KB" a partir de bytes. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Alertas de vencimento (T-43) ---

// Gradação de urgência (dias até vencer). Vencida é o caso crítico.
export const ALERTA_DIAS_CRITICO = 5;
export const ALERTA_DIAS_ALERTA = 15;

export type AlertaSeveridade = 'critico' | 'alerta' | 'aviso';

export interface CertidaoAlertas {
  vencidas: Certidao[];
  vencendo: Certidao[]; // ainda válidas, mas dentro de VENCENDO_DIAS
  /** Menor nº de dias até vencer entre as "vencendo" (null se não há). */
  diasMaisUrgente: number | null;
  /** Cor do alerta: vermelho (crítico), laranja (alerta) ou amarelo (aviso). */
  severidade: AlertaSeveridade;
  /** Verdadeiro quando há algo a sinalizar. */
  temAlerta: boolean;
}

/**
 * Agrega as certidões que precisam de atenção (vencidas ou vencendo em até
 * VENCENDO_DIAS). A severidade é graduada por 30/15/5 dias (T-43).
 */
export function certidaoAlertas(certidoes: Certidao[]): CertidaoAlertas {
  const vencidas = certidoes.filter(
    (c) => validadeStatus(c.dataValidade) === 'vencido',
  );
  const vencendo = certidoes.filter(
    (c) => validadeStatus(c.dataValidade) === 'vencendo',
  );

  const diasMaisUrgente = vencendo.length
    ? Math.min(...vencendo.map((c) => daysUntil(c.dataValidade)))
    : null;

  let severidade: AlertaSeveridade = 'aviso';
  if (vencidas.length > 0 || (diasMaisUrgente ?? Infinity) <= ALERTA_DIAS_CRITICO) {
    severidade = 'critico';
  } else if ((diasMaisUrgente ?? Infinity) <= ALERTA_DIAS_ALERTA) {
    severidade = 'alerta';
  }

  return {
    vencidas,
    vencendo,
    diasMaisUrgente,
    severidade,
    temAlerta: vencidas.length > 0 || vencendo.length > 0,
  };
}

export const SEVERIDADE_COR: Record<AlertaSeveridade, string> = {
  critico: 'red',
  alerta: 'orange',
  aviso: 'yellow',
};
