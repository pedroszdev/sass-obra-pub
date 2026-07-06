// spikes/pncp-atualizacao.mjs
// Spike T-114 — validar o endpoint de ATUALIZAÇÃO do PNCP para re-sincronizar
// situação/prazo de editais que já captamos (por data de PUBLICAÇÃO) mas que
// mudaram depois (anulação/revogação/prorrogação acontecem semanas depois, fora
// da janela de overlap — hoje nunca revisitamos, então "edital morto" fica vivo).
//
// Objetivo (só medir/validar — não altera produção):
//   1. o endpoint /contratacoes/atualizacao responde? mesmos params do publicacao?
//   2. QUAIS strings de situacaoCompraNome existem? (precisamos delas para o
//      filtro "excluir anulado/revogado" — o domínio não está documentado no repo)
//   3. ele traz registros que mudaram (situação != "Divulgada", prazo novo)?
//
// Rode com:  node spikes/pncp-atualizacao.mjs   (Node 20+, fetch nativo, zero deps)
// Descartável. Se validar, vira o passe periódico do re-sync (T-114).

const UF = 'SC';
const DIAS = 14; // janela de dataAtualizacao a inspecionar
const MODALIDADES = [4, 5]; // as que captamos hoje (Concorrência)
const TAMANHO_PAGINA = 50;
const DELAY_MS = 700;
const TIMEOUT_MS = 45000;
const MAX_TENTATIVAS = 6;
const BACKOFF_MS = 3000;

// Endpoint de ATUALIZAÇÃO (filtra por dataAtualizacao). Se o path/params
// diferirem, o 4xx abaixo mostra a mensagem do PNCP — ajuste e rode de novo.
const BASE_URL = 'https://pncp.gov.br/api/consulta/v1/contratacoes/atualizacao';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatarData(date) {
  const ano = date.getUTCFullYear();
  const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(date.getUTCDate()).padStart(2, '0');
  return `${ano}${mes}${dia}`;
}

function periodo() {
  const hoje = new Date();
  const inicio = new Date();
  inicio.setDate(hoje.getDate() - DIAS);
  return { dataInicial: formatarData(inicio), dataFinal: formatarData(hoje) };
}

async function buscarPagina(modalidade, pagina, datas) {
  const params = new URLSearchParams({
    dataInicial: datas.dataInicial,
    dataFinal: datas.dataFinal,
    codigoModalidadeContratacao: String(modalidade),
    uf: UF,
    pagina: String(pagina),
    tamanhoPagina: String(TAMANHO_PAGINA),
  });
  const url = `${BASE_URL}?${params.toString()}`;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    let resp;
    try {
      resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (erro) {
      if (tentativa >= MAX_TENTATIVAS) throw new Error(`rede/timeout: ${erro.message}`);
      console.log(`    ⏳ timeout/rede na página ${pagina}; aguardando ${BACKOFF_MS * tentativa}ms (${tentativa}/${MAX_TENTATIVAS})`);
      await sleep(BACKOFF_MS * tentativa);
      continue;
    }
    if (resp.status === 204) return { data: [], totalRegistros: 0, totalPaginas: 0 };
    if (resp.status === 429 || resp.status >= 500) {
      console.log(`    ⏳ HTTP ${resp.status} na página ${pagina}; aguardando ${BACKOFF_MS * tentativa}ms (${tentativa}/${MAX_TENTATIVAS})`);
      await sleep(BACKOFF_MS * tentativa);
      continue;
    }
    const texto = await resp.text();
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} em ${url}\n${texto.slice(0, 300)}`);
    }
    return JSON.parse(texto);
  }
  throw new Error(`falha persistente na página ${pagina}`);
}

async function buscarTodos(modalidade, datas) {
  const primeira = await buscarPagina(modalidade, 1, datas);
  const totalPaginas = primeira.totalPaginas ?? 0;
  const registros = [...(primeira.data ?? [])];
  for (let p = 2; p <= totalPaginas; p++) {
    await sleep(DELAY_MS);
    const pagina = await buscarPagina(modalidade, p, datas);
    registros.push(...(pagina.data ?? []));
  }
  return { registros, totalRegistros: primeira.totalRegistros ?? registros.length };
}

async function main() {
  const datas = periodo();
  console.log('T-114 — Endpoint de ATUALIZAÇÃO do PNCP (re-sync de situação/prazo)');
  console.log(`  UF: ${UF} | dataAtualizacao: ${datas.dataInicial}–${datas.dataFinal} (${DIAS} dias)`);
  console.log(`  Endpoint: ${BASE_URL}\n`);

  const todos = [];
  for (const mod of MODALIDADES) {
    try {
      const { registros, totalRegistros } = await buscarTodos(mod, datas);
      console.log(`  ✓ modalidade ${mod}: ${registros.length}/${totalRegistros} atualizações`);
      todos.push(...registros);
    } catch (erro) {
      console.error(`  ✖ modalidade ${mod} falhou: ${erro.message}\n`);
    }
    await sleep(DELAY_MS);
  }

  if (todos.length === 0) {
    console.log('\nNenhum registro. Se foi erro 4xx acima, o path/params do endpoint difere — ajustar.');
    return;
  }

  // (2) Domínio de situacaoCompraNome — o que precisamos para o filtro de exclusão.
  const porSituacao = {};
  for (const r of todos) {
    const s = r.situacaoCompraNome ?? '(null)';
    porSituacao[s] = (porSituacao[s] ?? 0) + 1;
  }
  console.log(`\n${'='.repeat(64)}\nsituacaoCompraNome encontradas (${todos.length} atualizações)\n${'='.repeat(64)}`);
  for (const s of Object.keys(porSituacao).sort((a, b) => porSituacao[b] - porSituacao[a])) {
    console.log(`  ${String(porSituacao[s]).padStart(5)}  ${s}`);
  }

  // (3) Amostra dos que NÃO estão "Divulgada" (os mortos/alterados que hoje ficam vivos).
  const alterados = todos.filter((r) => !/divulgad/i.test(r.situacaoCompraNome ?? ''));
  console.log(`\n${'='.repeat(64)}\nAmostra de atualizações NÃO "Divulgada" (${alterados.length})\n${'='.repeat(64)}`);
  alterados.slice(0, 20).forEach((r) => {
    console.log(`  [${r.situacaoCompraNome}] ${r.numeroControlePNCP}`);
    console.log(`     atualizado: ${r.dataAtualizacao ?? '?'} | prazo: ${r.dataEncerramentoProposta ?? '?'}`);
  });

  console.log(`\n${'='.repeat(64)}\nCampos disponíveis no 1º registro (para o mapper do re-sync)\n${'='.repeat(64)}`);
  console.log('  ' + Object.keys(todos[0]).join(', '));

  console.log(`\n→ Se aparecerem "Anulada"/"Revogada"/"Suspensa"/"Encerrada" aqui, o endpoint`);
  console.log(`  serve para o re-sync: um passe periódico por dataAtualizacao atualiza a`);
  console.log(`  situação/prazo dos editais que já temos, e a busca/agenda excluem os mortos.`);
}

main();
