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

// Decide se um edital é de obra. Regra (favor recall — decisão 2026-06-16):
//   1. bate palavra de exclusão        → não-obra;
//   2. é modalidade de obra da fonte    → obra;
//   3. bate palavra de inclusão         → obra (pega obra fora dessas modalidades);
//   4. senão                            → não-obra.
export function isEditalObra(input: ObraClassificationInput): boolean {
  const text = normalizeText(input.objeto);
  if (matchesAny(text, OBRA_EXCLUSION_KEYWORDS)) {
    return false;
  }
  if (isObraModalidade(input.fonte, input.modalidadeId)) {
    return true;
  }
  return matchesAny(text, OBRA_INCLUSION_KEYWORDS);
}
