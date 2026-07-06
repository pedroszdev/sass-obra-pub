import { normalizeText } from '../../common/text';
import { EditalFonte } from '../edital-fonte.enum';
import {
  OBRA_EXCLUSION_KEYWORDS,
  OBRA_INCLUSION_KEYWORDS,
  OBRA_MODALIDADES,
} from './obra-catalog';

// Entrada mínima para classificar — atende EditalSourceRecord e Edital.
export interface ObraClassificationInput {
  fonte: EditalFonte;
  modalidadeId: number;
  objeto: string;
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function isObraModalidade(fonte: EditalFonte, modalidadeId: number): boolean {
  return (OBRA_MODALIDADES[fonte] ?? []).includes(modalidadeId);
}

// Decide se um edital é de obra. Regra (favor recall — §3.3; revista na T-115 para
// a inclusão vencer a exclusão — antes a exclusão rodava primeiro e derrubava obra
// real como "obra com locação" ou "construção da sede da Vigilância Sanitária"):
//   1. bate palavra de inclusão   → obra (inclusão vence exclusão);
//   2. bate palavra de exclusão   → não-obra (só decide quando não há inclusão);
//   3. é modalidade de obra       → obra (Concorrência basta, mesmo sem palavra);
//   4. senão                      → não-obra.
export function isEditalObra(input: ObraClassificationInput): boolean {
  const text = normalizeText(input.objeto);
  if (matchesAny(text, OBRA_INCLUSION_KEYWORDS)) {
    return true;
  }
  if (matchesAny(text, OBRA_EXCLUSION_KEYWORDS)) {
    return false;
  }
  return isObraModalidade(input.fonte, input.modalidadeId);
}
