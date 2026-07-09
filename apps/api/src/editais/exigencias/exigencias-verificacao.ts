import { ExigenciasHabilitacao } from './exigencias.types';

// Verificação anti-alucinação (achado da T-48): cada `trecho` citado pela IA
// deve existir LITERALMENTE no texto do edital. O resultado vira sinal de
// qualidade (trechosOk/total) — a T-52 decide se mostra. Funções puras.

export function normalizaTexto(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[“”‘’«»]/g, '"') // aspas curvas → reta
    .replace(/\s+/g, ' ')
    .trim();
}

// Palavras que indicam que o documento É um edital com seção de habilitação
// (e não um projeto executivo/ART/anexo, que não tem). Achado central da T-48.
//
// T-137 (achado da T-107): `certidao` e `cnpj` saíram da lista. Eram genéricos
// demais — aparecem em apêndice, ART e memorial —, e com o mínimo de 2 sinais
// bastavam para aprovar um `Apendice_As_Built.pdf` como se fosse o edital. Os
// que sobraram só ocorrem em seção de habilitação de verdade.
const SINAIS_HABILITACAO = [
  'habilita',
  'regularidade',
  'fgts',
  'fazenda',
  'cndt',
  'falencia',
];

export function temSinalHabilitacao(texto: string, minChars = 1500): boolean {
  if (!texto || texto.length < minChars) return false;
  const t = normalizaTexto(texto);
  return SINAIS_HABILITACAO.filter((s) => t.includes(s)).length >= 2;
}

// Quebra o trecho por "[...]"/"..." e checa se cada fragmento (>=12 chars)
// aparece no texto normalizado. Retorna null se o trecho é curto demais.
function trechoConfere(trecho: string, textoNorm: string): boolean | null {
  const frags = normalizaTexto(trecho)
    .replace(/"/g, ' ')
    .split(/\[\.\.\.\]|\.\.\.|…/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 12);
  if (frags.length === 0) return null;
  return frags.every((f) => textoNorm.includes(f));
}

function coletarTrechos(e: ExigenciasHabilitacao): string[] {
  const out: string[] = [];
  for (const c of e.certidoes) if (c.exigida && c.trecho) out.push(c.trecho);
  if (e.registroConselho.exigido && e.registroConselho.trecho)
    out.push(e.registroConselho.trecho);
  if (e.capacidadeTecnica.exigida && e.capacidadeTecnica.trecho)
    out.push(e.capacidadeTecnica.trecho);
  if (e.capitalSocial.exigido && e.capitalSocial.trecho)
    out.push(e.capitalSocial.trecho);
  if (e.garantia.exigida && e.garantia.trecho) out.push(e.garantia.trecho);
  return out;
}

// Quantos trechos citados existem de fato no edital (dos que dá para verificar).
export function verificarTrechos(
  exigencias: ExigenciasHabilitacao,
  texto: string,
): { ok: number; total: number } {
  const textoNorm = normalizaTexto(texto);
  const checados = coletarTrechos(exigencias)
    .map((t) => trechoConfere(t, textoNorm))
    .filter((r): r is boolean => r !== null);
  return { ok: checados.filter(Boolean).length, total: checados.length };
}
