import { normalizeText } from '../../common/text';
import { EditalFonte } from '../edital-fonte.enum';
import {
  OBRA_EXCLUSION_KEYWORDS,
  OBRA_EXECUTION_VERBS,
  OBRA_MODALIDADES,
  OBRA_NEGATIVE_PATTERNS,
  OBRA_STRONG_KEYWORDS,
  OBRA_WEAK_KEYWORDS,
} from './obra-catalog';

// Entrada mínima para classificar — atende EditalSourceRecord e Edital.
export interface ObraClassificationInput {
  fonte: EditalFonte;
  modalidadeId: number;
  objeto: string;
}

// Escapa metacaracteres de regex numa keyword do catálogo (segurança/robustez —
// as listas hoje são só letras+espaço, mas isso protege ajustes futuros).
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Casa qualquer keyword como STEM ancorado no início da palavra (limite de
// palavra à esquerda, sem limite à direita) — T-125. Assim `pavimenta` pega
// "pavimentacao"/"pavimentar", `\bconstruc` pega "construcao" mas NÃO
// "reconstrucao" (o `\b` fica antes de "reconstrucao", não no meio). Cada
// keyword vira `\b<kw>`; espaços internos são literais ("muro de contencao").
function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword)}`).test(text),
  );
}

// Remove os padrões negativos do texto (globalmente) antes de casar positivos —
// desarma "materiais de construcao"/"mao de obra" sem apagar "construcao de X".
function stripNegatives(text: string): string {
  let out = text;
  for (const pattern of OBRA_NEGATIVE_PATTERNS) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(pattern)}`, 'g'), ' ');
  }
  return out;
}

function isObraModalidade(fonte: EditalFonte, modalidadeId: number): boolean {
  return (OBRA_MODALIDADES[fonte] ?? []).includes(modalidadeId);
}

// Decide se um edital é de obra. Regra (T-125 — refina o casamento por limite de
// palavra e separa sinais fortes/fracos para não inundar pregão/dispensa de
// falsos-positivos; preserva o favor-recall da §3.3 na Concorrência):
//   0. remove padrões negativos ("mao de obra", "materiais de construcao");
//   1. sinal FORTE (construção/pavimentação/…) → obra (vence exclusão);
//   2. sinal FRACO (esgoto/drenagem/…) + verbo de execução → obra;
//   3. modalidade de obra (Concorrência): obra por padrão (favor recall),
//      salvo exclusão clara (locação/vigilância/…) sem sinal forte;
//   4. senão (pregão/dispensa sem sinal forte) → não-obra.
export function isEditalObra(input: ObraClassificationInput): boolean {
  // Hífen/barra viram espaço antes de tudo: senão "mao-de-obra" escapa do strip
  // negativo e "obra" casa como falso-positivo (achado ao vivo na T-125).
  const normalized = normalizeText(input.objeto).replace(/[-/]/g, ' ');
  const text = stripNegatives(normalized);

  if (matchesAny(text, OBRA_STRONG_KEYWORDS)) {
    return true;
  }
  if (
    matchesAny(text, OBRA_WEAK_KEYWORDS) &&
    matchesAny(text, OBRA_EXECUTION_VERBS)
  ) {
    return true;
  }
  if (isObraModalidade(input.fonte, input.modalidadeId)) {
    return !matchesAny(text, OBRA_EXCLUSION_KEYWORDS);
  }
  return false;
}
