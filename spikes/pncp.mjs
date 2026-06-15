// spikes/pncp.mjs
// Spike T-01 — chamar a API pública de consulta do PNCP e imprimir editais em JSON.
// Rode com:  node spikes/pncp.mjs   (Node 20+, fetch nativo, zero dependências)
//
// Objetivo: ver com os próprios olhos o que a API do PNCP retorna.
// NÃO é código de produto — é um spike descartável de exploração.

// ---------------------------------------------------------------------------
// Parâmetros configuráveis — ajuste e rode de novo para explorar a API.
// ---------------------------------------------------------------------------
const DIAS_PARA_TRAS = 7; // tamanho da janela do período de consulta
const CODIGO_MODALIDADE = 6; // 6 = Pregão Eletrônico (modalidade comum p/ ter volume)
const PAGINA = 1;
const TAMANHO_PAGINA = 10; // poucos registros: a meta é inspecionar, não baixar tudo
const UF = null; // ex.: 'SC' para filtrar por estado; null = todos
const TIMEOUT_MS = 20000;

// Endpoint de consulta de contratações por data de publicação.
const BASE_URL = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatarData(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}${mes}${dia}`; // yyyyMMdd — formato exigido pelo PNCP
}

function montarUrl() {
  const hoje = new Date();
  const inicio = new Date();
  inicio.setDate(hoje.getDate() - DIAS_PARA_TRAS);

  const params = new URLSearchParams({
    dataInicial: formatarData(inicio),
    dataFinal: formatarData(hoje),
    codigoModalidadeContratacao: String(CODIGO_MODALIDADE),
    pagina: String(PAGINA),
    tamanhoPagina: String(TAMANHO_PAGINA),
  });
  if (UF) params.set('uf', UF);

  return `${BASE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
async function main() {
  const url = montarUrl();
  console.log('→ Chamando PNCP:');
  console.log('  ' + url + '\n');

  let resposta;
  try {
    resposta = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    console.error('✖ Falha na requisição (rede/timeout):', erro.message);
    process.exit(1);
  }

  console.log(`← HTTP ${resposta.status} ${resposta.statusText}\n`);

  if (resposta.status === 204) {
    console.log('Nenhum edital para esse período/modalidade (204 No Content).');
    console.log('Dica: aumente DIAS_PARA_TRAS ou troque CODIGO_MODALIDADE e rode de novo.');
    return;
  }

  const texto = await resposta.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    console.error('✖ Resposta não é JSON. Primeiros 500 caracteres:');
    console.error(texto.slice(0, 500));
    process.exit(1);
  }

  if (!resposta.ok) {
    console.error('✖ A API retornou erro:');
    console.error(JSON.stringify(dados, null, 2));
    process.exit(1);
  }

  const registros = dados.data ?? [];
  console.log(`Total de registros no período: ${dados.totalRegistros ?? '?'}`);
  console.log(`Total de páginas: ${dados.totalPaginas ?? '?'}`);
  console.log(`Registros nesta página: ${registros.length}\n`);

  if (registros.length === 0) {
    console.log('Veio 0 registros nesta página. Ajuste os parâmetros e rode de novo.');
    return;
  }

  // Mostra as chaves do 1º registro — para enxergar quais campos a fonte traz.
  console.log('─'.repeat(60));
  console.log('Campos disponíveis no 1º edital:');
  console.log(Object.keys(registros[0]).join(', '));
  console.log('─'.repeat(60) + '\n');

  // Imprime os 3 primeiros editais inteiros, formatados.
  console.log('Primeiros editais (JSON):');
  console.log(JSON.stringify(registros.slice(0, 3), null, 2));
}

main();
