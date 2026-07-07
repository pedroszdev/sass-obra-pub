import type { CreatePropostaItemInput } from '../types/proposta';

// Parsing da inclusão manual de itens da proposta (T-65). Extraído do editor para
// ser testável (T-109). Aceita número no padrão brasileiro (1.234,56).

/** "1.234,56" → 1234.56; vazio/ inválido → null. */
export function parseNum(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Cola de planilha → itens. Uma linha por item; colunas separadas por TAB, `;`
 * ou 2+ espaços: descrição, unidade, quantidade, preço. Linhas sem descrição são
 * descartadas.
 */
export function parseItensColados(colar: string): CreatePropostaItemInput[] {
  return colar
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [descricao, unidade, qtd, prc] = l.split(/\t|;|\s{2,}/);
      return {
        descricao: (descricao ?? '').trim(),
        unidade: unidade?.trim() || null,
        quantidade: qtd ? parseNum(qtd) : null,
        precoUnitario: prc ? parseNum(prc) : null,
      };
    })
    .filter((i) => i.descricao);
}
