// spikes/pncp.mjs
// Spike T-01 + T-02 — explorar a API publica de consulta do PNCP.
//   T-01: ver editais reais chegando em JSON.
//   T-02: validar volume de OBRA e completude dos dados para uma UF
//         (modalidade Concorrencia), com contagem por dia.
//
// Rode com:  node spikes/pncp.mjs   (Node 20+, fetch nativo, zero dependencias)
// NAO e codigo de produto — e um spike descartavel de exploracao.
//
// Achado da T-02: o PNCP aplica RATE LIMIT (HTTP 429). O conector de
// producao (T-13) vai precisar de throttle + backoff. Aqui ja tratamos isso.

// ---------------------------------------------------------------------------
// Parametros configuraveis — ajuste e rode de novo para explorar.
// ---------------------------------------------------------------------------
const UF = 'SC'; // estado a investigar
const DIAS = 30; // janela do periodo (p/ media por dia)
const MODALIDADES_OBRA = [4, 5]; // 4 = Concorrencia Eletronica, 5 = Presencial
const TAMANHO_PAGINA = 50; // maximo permitido pelo PNCP (menos requisicoes)
const DELAY_MS = 700; // pausa entre paginas (educado com a API)
const TIMEOUT_MS = 20000;
const MAX_TENTATIVAS = 5; // re-tentativas no 429 antes de desistir da pagina
const BACKOFF_MS = 3000; // espera base no 429, multiplicada pela tentativa

const NOME_MODALIDADE = { 4: 'Concorrencia - Eletronica', 5: 'Concorrencia - Presencial' };

// Palavras-chave para o cross-check de obra no objetoCompra (sem acento, minusculo).
// E so um teste do spike — o catalogo de verdade, configuravel, e a T-09.
const PALAVRAS_OBRA = [
  'obra', 'constru', 'reforma', 'pavimenta', 'recapea', 'edifica', 'engenharia',
  'drenagem', 'saneamento', 'urbaniza', 'revitaliza', 'ampliacao', 'calcament',
  'ponte', 'muro', 'quadra', 'reservatorio', 'galeria', 'terraplanagem',
];

const BASE_URL = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatarData(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}${mes}${dia}`; // yyyyMMdd — formato exigido pelo PNCP
}

function semAcento(texto) {
  return (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function pareceObra(objetoCompra) {
  const t = semAcento(objetoCompra);
  return PALAVRAS_OBRA.some((p) => t.includes(p));
}

function periodo() {
  const hoje = new Date();
  const inicio = new Date();
  inicio.setDate(hoje.getDate() - DIAS);
  return { dataInicial: formatarData(inicio), dataFinal: formatarData(hoje) };
}

function pct(parte, total) {
  return total === 0 ? '0%' : `${((parte / total) * 100).toFixed(1)}%`;
}

// Busca uma pagina, re-tentando com backoff quando bate no rate limit (429).
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
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resp.status === 204) return { data: [], totalRegistros: 0, totalPaginas: 0 };
    if (resp.status === 429) {
      const espera = BACKOFF_MS * tentativa;
      console.log(`    ⏳ 429 na pagina ${pagina}; aguardando ${espera}ms (tentativa ${tentativa}/${MAX_TENTATIVAS})`);
      await sleep(espera);
      continue;
    }
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}\n${texto.slice(0, 200)}`);
    return JSON.parse(texto);
  }
  throw new Error(`Rate limit persistente na pagina ${pagina} apos ${MAX_TENTATIVAS} tentativas`);
}

// Pagina todas as paginas de uma modalidade. Se uma pagina falhar de vez,
// devolve o que ja coletou (parcial) em vez de descartar tudo.
async function buscarTodos(modalidade, datas) {
  const primeira = await buscarPagina(modalidade, 1, datas);
  const totalPaginas = primeira.totalPaginas ?? 0;
  const registros = [...(primeira.data ?? [])];
  for (let p = 2; p <= totalPaginas; p++) {
    await sleep(DELAY_MS);
    try {
      const pagina = await buscarPagina(modalidade, p, datas);
      registros.push(...(pagina.data ?? []));
    } catch (erro) {
      console.error(`    ✖ modalidade ${modalidade} interrompida na pagina ${p}/${totalPaginas}: ${erro.message}`);
      return { registros, totalRegistros: primeira.totalRegistros ?? registros.length, parcial: true };
    }
  }
  return { registros, totalRegistros: primeira.totalRegistros ?? registros.length, parcial: false };
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------
async function main() {
  const datas = periodo();
  console.log('Investigando OBRA no PNCP');
  console.log(`  UF: ${UF} | periodo: ${datas.dataInicial}–${datas.dataFinal} (${DIAS} dias)`);
  console.log(`  Modalidades: ${MODALIDADES_OBRA.map((m) => `${m} (${NOME_MODALIDADE[m]})`).join(', ')}\n`);

  const todos = [];
  let algumParcial = false;
  for (const modalidade of MODALIDADES_OBRA) {
    try {
      const { registros, totalRegistros, parcial } = await buscarTodos(modalidade, datas);
      algumParcial = algumParcial || parcial;
      console.log(`  ✓ modalidade ${modalidade}: ${registros.length}/${totalRegistros} registros${parcial ? ' (PARCIAL)' : ''}`);
      todos.push(...registros);
    } catch (erro) {
      console.error(`  ✖ modalidade ${modalidade} falhou: ${erro.message}`);
    }
    await sleep(DELAY_MS);
  }

  const total = todos.length;

  console.log(`\n${'='.repeat(64)}\nVOLUME\n${'='.repeat(64)}`);
  console.log(`Total de editais (Concorrencia) em ${UF} no periodo: ${total}${algumParcial ? ' (coleta parcial — ver 429 acima)' : ''}`);
  console.log(`Media por dia: ${(total / DIAS).toFixed(1)}\n`);

  const porDia = {};
  for (const r of todos) {
    const dia = (r.dataPublicacaoPncp ?? '').slice(0, 10) || 'sem-data';
    porDia[dia] = (porDia[dia] ?? 0) + 1;
  }
  console.log('Por dia de publicacao:');
  for (const dia of Object.keys(porDia).sort()) console.log(`  ${dia}: ${porDia[dia]}`);

  console.log(`\n${'='.repeat(64)}\nCOMPLETUDE DOS DADOS (de ${total} registros)\n${'='.repeat(64)}`);
  const comMunicipio = todos.filter((r) => r.unidadeOrgao?.municipioNome).length;
  const comUf = todos.filter((r) => r.unidadeOrgao?.ufSigla).length;
  const comIbge = todos.filter((r) => r.unidadeOrgao?.codigoIbge).length;
  const comValor = todos.filter((r) => r.valorTotalEstimado != null).length;
  console.log(`  municipioNome preenchido: ${comMunicipio} (${pct(comMunicipio, total)})`);
  console.log(`  ufSigla preenchido:       ${comUf} (${pct(comUf, total)})`);
  console.log(`  codigoIbge preenchido:    ${comIbge} (${pct(comIbge, total)})`);
  console.log(`  valorTotalEstimado:       ${comValor} (${pct(comValor, total)})`);

  console.log(`\n${'='.repeat(64)}\nCROSS-CHECK: quantas Concorrencias "parecem obra" pelo objeto\n${'='.repeat(64)}`);
  const obraPorPalavra = todos.filter((r) => pareceObra(r.objetoCompra)).length;
  console.log(`  ${obraPorPalavra} de ${total} (${pct(obraPorPalavra, total)}) batem com palavras-chave de obra`);
  console.log('  (Concorrencia pega obra, mas tambem servicos de engenharia/continuos —');
  console.log('   por isso o filtro final vai precisar de palavra-chave: T-09.)\n');
  console.log('Amostra de 10 objetoCompra:');
  todos.slice(0, 10).forEach((r) => {
    const marca = pareceObra(r.objetoCompra) ? '[obra?]' : '[     ]';
    console.log(`  ${marca} ${r.unidadeOrgao?.municipioNome ?? '?'}: ${r.objetoCompra ?? '(sem objeto)'}`);
  });

  console.log(`\n${'='.repeat(64)}\nVEREDITO\n${'='.repeat(64)}`);
  console.log(`  Volume: ${total} Concorrencias em ${UF} em ${DIAS} dias (~${(total / DIAS).toFixed(1)}/dia).`);
  console.log(`  Completude: municipio ${pct(comMunicipio, total)}, valor ${pct(comValor, total)}, IBGE ${pct(comIbge, total)}.`);
  console.log('  Rate limit (429) confirmado: insumo para a T-13 (throttle + backoff).');
}

main();
