import { Uf } from '../../common/uf';
import { EditalFonte } from '../edital-fonte.enum';

// Formato interno padronizado que TODO conector deve produzir (CLAUDE.md §3.1).
// É o `Edital` sem as colunas que o sistema preenche depois:
//   - `isObra` (classificação — T-09/T-15);
//   - `objetoBusca`, `id`, `createdAt`, `updatedAt` (gerados pelo banco).
// Tipo independente da entidade de propósito: o conector não conhece persistência.
export interface EditalSourceRecord {
  fonte: EditalFonte;
  // `fonte` + `idExterno` é a chave de deduplicação/upsert (CLAUDE.md §3.2).
  idExterno: string;
  orgaoNome: string;
  orgaoCnpj: string | null;
  uf: Uf;
  municipioNome: string;
  codigoIbge: string | null;
  objeto: string;
  modalidadeId: number;
  modalidadeNome: string;
  valorEstimado: number | null;
  dataPublicacao: Date;
  prazoProposta: Date | null;
  linkOrigem: string | null;
  situacao: string | null;
  // Registro cru da fonte — permite reprocessar/usar campos novos sem re-baixar.
  rawPayload: Record<string, unknown>;
}
