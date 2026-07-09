import { ItemPlanilha } from './itens.types';

// Guarda determinística sobre a saída da IA (§3.4). A extração da planilha (T-64)
// às vezes devolve linhas sem dado útil — planilha modelo em branco, cabeçalhos
// de seção, alucinação — e importá-las encheria a proposta de itens zerados
// (saída de IA errada é pior que ausência). Esta função roda DEPOIS da IA, antes
// de persistir, e é pura/testável.
//
// Regra (decisão do dono, 02/07/2026): um item vale se tiver DESCRIÇÃO real (ao
// menos uma letra) — quantidade é bônus, não obrigatória. Além de descartar as
// linhas sem descrição, normaliza quantidade/preço não-positivos (0 ou negativo)
// para null: o editor mostra o campo vazio para o empreiteiro preencher, em vez
// de um "0" falso.

function temDescricao(descricao: string): boolean {
  const d = (descricao ?? '').trim();
  // Precisa de ao menos uma letra — descarta "", "-", "0", "123" e afins.
  return d.length > 0 && /\p{L}/u.test(d);
}

// T-136 (achado da T-107): em planilha com colunas desalinhadas a IA copia a
// UNIDADE para a descrição — "UNID.", "M2", "M". Essas linhas têm letra e
// quantidade, então passavam por `temDescricao` e viravam item da proposta do
// empreiteiro. Um item cuja descrição é só a unidade não descreve serviço nenhum.
const UNIDADES = [
  'un',
  'und',
  'unid',
  'unidade',
  'pc',
  'pca',
  'peca',
  'cj',
  'conj',
  'm',
  'm2',
  'm3',
  'ml',
  'cm',
  'mm',
  'km',
  'kg',
  'g',
  't',
  'ton',
  'l',
  'lt',
  'h',
  'hr',
  'hora',
  'dia',
  'mes',
  'vb',
  'gl',
  'sc',
  'pt',
  'cx',
  'par',
  'jg',
  'lote',
  'serv',
];

// Normaliza para comparar: sem acento, sem pontuação, minúsculo, sem espaço.
function chaveUnidade(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// A descrição não passa de um rótulo de unidade? (seja igual à coluna `unidade`
// do próprio item, seja um token de unidade conhecido)
function descricaoEhSoUnidade(item: ItemPlanilha): boolean {
  const desc = chaveUnidade(item.descricao);
  if (!desc) return false;
  const un = chaveUnidade(item.unidade);
  if (un && desc === un) return true;
  return UNIDADES.includes(desc);
}

function positivoOuNull(n: number | null): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/** Mantém só os itens com descrição real; zera (→ null) quantidade/preço ≤ 0. */
export function filtrarItensUteis(itens: ItemPlanilha[]): ItemPlanilha[] {
  return itens
    .filter((it) => temDescricao(it.descricao) && !descricaoEhSoUnidade(it))
    .map((it) => ({
      ...it,
      quantidade: positivoOuNull(it.quantidade),
      precoReferencia: positivoOuNull(it.precoReferencia),
    }));
}
