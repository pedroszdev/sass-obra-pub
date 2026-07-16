import { EditalDocumentCandidate } from '../edital-source-connector';

// Item da listagem de arquivos do PNCP (só o que usamos; resto ignorado).
export interface PncpArquivo {
  titulo?: string;
  tipoDocumentoNome?: string;
  url?: string;
  uri?: string;
  statusAtivo?: boolean;
  [key: string]: unknown;
}

// Achado da T-48: o PNCP costuma marcar VÁRIOS arquivos como tipo "Edital"
// (projeto executivo, ART, edital...). Pegar o errado (projeto, sem habilitação)
// faz a IA devolver "nada exigido". Estes nomes denunciam um doc que NÃO é o
// edital principal.
//
// T-137 (achado da T-107): `apêndice`, `as built`, `minuta` e `termo de
// referência` faltavam. Um `9_Apendice_As_Built_VF.pdf` marcou score 2 ("não
// parece projeto") e venceu o edital de verdade — a IA resumiu fielmente o
// apêndice e devolveu zero exigências, cacheadas para sempre.
const NAO_EDITAL =
  /executiv|projeto|memorial|planilha|cronograma|\bart\b|or[çc]ament|anexo|ap[êe]ndice|as.?built|minuta|termo.?de.?refer|mapa|plant|caderno|estudo/i;

function pareceProjeto(a: PncpArquivo): boolean {
  return NAO_EDITAL.test(a.titulo ?? '');
}

function score(a: PncpArquivo): number {
  const titulo = a.titulo ?? '';
  if (/edital/i.test(titulo) && !pareceProjeto(a)) return 0; // o edital, pelo título
  if (/edital/i.test(a.tipoDocumentoNome ?? '') && !pareceProjeto(a)) return 1;
  if (!pareceProjeto(a)) return 2; // outro doc que não parece projeto/anexo
  return 3; // projeto/ART/anexo — último recurso
}

// Ranqueia os arquivos do PNCP: o edital principal primeiro. Função pura (T-49).
// Só ORDENA — a URL sai daqui verbatim, como veio do feed. Quem decide se ela
// pode virar link é o `EditalDocumentosService`, que é o ponto por onde TODO
// conector serve a tela (aqui a guarda só valeria para o PNCP).
export function rankPncpArquivos(
  arquivos: PncpArquivo[],
): EditalDocumentCandidate[] {
  const ativos = arquivos.filter((a) => a.statusAtivo !== false);
  const lista = ativos.length ? ativos : arquivos;
  return lista
    .map((a, i) => ({ a, i, s: score(a) }))
    .sort((x, y) => x.s - y.s || x.i - y.i) // estável: mantém ordem em empate
    .map(({ a }) => ({
      nome: a.titulo ?? '(sem título)',
      url: a.url ?? a.uri ?? '',
    }))
    .filter((c) => c.url !== '');
}
