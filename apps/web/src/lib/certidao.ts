import type { CertidaoTipo } from '../types/company-profile';
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
