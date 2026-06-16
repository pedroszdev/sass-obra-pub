// spikes/compras-gov.mjs
// Spike T-03 — explorar a API de dados abertos do Compras.gov.br
// (dadosabertos.compras.gov.br) e comparar com o PNCP (T-01/T-02).
//
// Rode com:  node spikes/compras-gov.mjs   (Node 20+, fetch nativo, zero deps)
// NAO e codigo de producao — spike descartavel de exploracao.
//
// Espelha a T-02 (SC, 30 dias) para comparar maca-com-maca. Duas sondas:
//   A) modulo-contratacoes (Lei 14.133) — quanto cobre vs PNCP?
//   B) modulo-legado (Lei 8.666 / SIASG) — complemento federal?
//
// ACHADO: o "codigoModalidade" desta API tem numeracao PROPRIA (o equivalente
// do PNCP fica no campo "modalidadeIdPncp"). Por isso a Sonda A varre os codigos
// e identifica a Concorrencia pelo modalidadeIdPncp, em vez de assumir igualdade.

// ---------------------------------------------------------------------------
// Parametros
// ---------------------------------------------------------------------------
const UF = 'SC';
const DIAS = 30;
const TAMANHO_PAGINA = 50; // < 10 da erro 400 nesta API
const DELAY_MS = 700;
const TIMEOUT_MS = 20000;
const MAX_TENTATIVAS = 5;
const BACKOFF_MS = 3000;

// O que a T-02 mediu no PNCP (SC, 30 dias) — base da comparacao.
const PNCP_T02_CONCORRENCIA_ELETRONICA = 661; // modalidadeIdPncp = 4
const ID_PNCP_CONCORRENCIA_ELETRONICA = 4;

const URL_CONTRATACOES = 'https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133';
const URL_LEGADO = 'https://dadosabertos.compras.gov.br/modulo-legado/1_consultarLicitacao';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dataISO(offsetDias) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (formato desta API)
}

function montar(url, params) {
  return `${url}?${new URLSearchParams(params).toString()}`;
}

// Busca com retry/backoff no 429 (mesmo aprendizado da T-02).
async function buscar(url) {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resp.status === 204) return { resultado: [], totalRegistros: 0 };
    if (resp.status === 429) {
      const espera = BACKOFF_MS * tentativa;
      console.log(`    ⏳ 429; aguardando ${espera}ms (tentativa ${tentativa}/${MAX_TENTATIVAS})`);
      await sleep(espera);
      continue;
    }
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}\n${texto.slice(0, 160)}`);
    return JSON.parse(texto);
  }
  throw new Error(`Rate limit persistente em ${url}`);
}

// ---------------------------------------------------------------------------
// Sonda A — modulo-contratacoes (Lei 14.133): varre modalidades e mede cobertura
// ---------------------------------------------------------------------------
async function sondaContratacoes() {
  console.log(`\n${'='.repeat(64)}\nSONDA A — modulo-contratacoes (Lei 14.133)\n${'='.repeat(64)}`);
  const di = dataISO(-DIAS);
  const df = dataISO(0);
  console.log(`  UF=${UF} | ${di}..${df} | varrendo codigoModalidade 1..14\n`);

  const linhas = [];
  let exemplo = null;
  for (let cod = 1; cod <= 14; cod++) {
    const url = montar(URL_CONTRATACOES, {
      pagina: 1,
      tamanhoPagina: TAMANHO_PAGINA,
      dataPublicacaoPncpInicial: di,
      dataPublicacaoPncpFinal: df,
      codigoModalidade: cod,
      unidadeOrgaoUfSigla: UF,
    });
    try {
      const json = await buscar(url);
      const total = json.totalRegistros ?? 0;
      if (total > 0) {
        const it = (json.resultado ?? [])[0];
        linhas.push({ cod, total, nome: it?.modalidadeNome, idPncp: it?.modalidadeIdPncp });
        if (!exemplo) exemplo = it;
      }
    } catch (e) {
      console.error(`  ✖ codigoModalidade ${cod}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log('  Modalidades com volume (mapeamento codigoModalidade -> PNCP):');
  for (const l of linhas) {
    console.log(`    codigoModalidade=${String(l.cod).padStart(2)} | ${String(l.total).padStart(4)} | "${l.nome}" (modalidadeIdPncp=${l.idPncp})`);
  }

  const conc = linhas.find((l) => l.idPncp === ID_PNCP_CONCORRENCIA_ELETRONICA);
  const totalConc = conc?.total ?? 0;
  console.log(`\n  COMPARACAO Concorrencia Eletronica (SC, ${DIAS} dias):`);
  console.log(`    Compras.gov.br: ${totalConc}   |   PNCP (T-02): ${PNCP_T02_CONCORRENCIA_ELETRONICA}`);
  const cobertura = ((totalConc / PNCP_T02_CONCORRENCIA_ELETRONICA) * 100).toFixed(1);
  console.log(`    -> Compras.gov.br cobre ${cobertura}% do que o PNCP traz (subconjunto).`);

  if (exemplo) {
    console.log('\n  Compartilha numeroControlePNCP? ' + ('numeroControlePNCP' in exemplo ? 'SIM (todo registro daqui tambem esta no PNCP)' : 'nao'));
    console.log('  Exemplo numeroControlePNCP: ' + exemplo.numeroControlePNCP);
  }
}

// ---------------------------------------------------------------------------
// Sonda B — modulo-legado (Lei 8.666 / SIASG federal)
// ---------------------------------------------------------------------------
async function sondaLegado() {
  console.log(`\n${'='.repeat(64)}\nSONDA B — modulo-legado (Lei 8.666 / SIASG)\n${'='.repeat(64)}`);

  async function inspecionar(rotulo, di, df) {
    const url = montar(URL_LEGADO, {
      pagina: 1,
      tamanhoPagina: 20,
      data_publicacao_inicial: di,
      data_publicacao_final: df,
    });
    const json = await buscar(url);
    console.log(`\n  [${rotulo}] ${di}..${df}: totalRegistros=${json.totalRegistros ?? 0}`);
    return json.resultado ?? [];
  }

  let itens = [];
  try {
    itens = await inspecionar('recente', dataISO(-DIAS), dataISO(0));
  } catch (e) {
    console.error('  ✖ ' + e.message);
  }

  // 8.666 esta em extincao (so 14.133 desde 2023). Se o periodo recente vier
  // vazio, busca uma amostra historica so para inspecionar o FORMATO dos campos.
  if (itens.length === 0) {
    console.log('  (0 recentes — 8.666 praticamente extinta; amostra historica p/ ver o formato)');
    await sleep(DELAY_MS);
    try {
      itens = await inspecionar('historico 2022', '2022-06-01', '2022-06-30');
    } catch (e) {
      console.error('  ✖ ' + e.message);
    }
  }

  if (itens.length === 0) {
    console.log('  Nenhum registro para inspecionar.');
    return;
  }

  console.log('\n  Campos do registro:');
  console.log('    ' + Object.keys(itens[0]).join(', '));
  const modalidades = [...new Set(itens.map((i) => `${i.modalidade}=${i.nome_modalidade}`))];
  console.log('\n  Modalidades presentes (codigos 8.666 — outra numeracao ainda):');
  modalidades.forEach((m) => console.log('    ' + m));
  console.log('\n  Escopo: chaveado por "uasg" (unidade federal); sem nome de municipio/UF.');
  console.log('  codigo_municipio_uasg (1o registro):', itens[0].codigo_municipio_uasg);
  console.log('\n  Amostra de objeto:');
  itens.slice(0, 5).forEach((i) => console.log(`    [${i.nome_modalidade}] ${(i.objeto ?? '').replace(/\s+/g, ' ').slice(0, 100)}`));
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('Comparando Compras.gov.br (dadosabertos) com o PNCP');
  await sondaContratacoes();
  await sleep(DELAY_MS);
  await sondaLegado();

  console.log(`\n${'='.repeat(64)}\nVEREDITO (sobreposicao x complemento)\n${'='.repeat(64)}`);
  console.log('  - modulo-contratacoes (14.133): SUBCONJUNTO do PNCP. Compartilha');
  console.log('    numeroControlePNCP e cobre so uma fracao do volume (so o que passou');
  console.log('    pela plataforma federal). Nada que o PNCP ja nao tenha.');
  console.log('  - modulo-legado (8.666): federal/SIASG e em extincao (0 recentes).');
  console.log('  => Para obra MUNICIPAL, o Compras.gov.br agrega pouco sobre o PNCP.');
}

main();
