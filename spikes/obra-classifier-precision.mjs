// spikes/obra-classifier-precision.mjs
// Spike T-125 (Fase 2) — medir a PRECISÃO do classificador refinado sobre
// pregão/dispensa ANTES de ligar a modalidade (§3.4: validar acerto antes de
// confiar). Importa o classificador REAL do dist (não uma cópia) para medir
// exatamente o que produção faria.
//
// Pré-requisito: `pnpm --filter api build` (gera apps/api/dist).
// Rode com:  node spikes/obra-classifier-precision.mjs        (SC, mod 6, 30d)
//            MOD=8 node spikes/obra-classifier-precision.mjs   (dispensa)
//            DIAS=30 UF=SC AMOSTRA=50 node spikes/obra-classifier-precision.mjs
//
// Saída: total, quantos o classificador marcou como OBRA, e DUAS amostras para
// rotular à mão — (A) marcados como obra (mede PRECISÃO: quantos são obra real)
// e (B) marcados como não-obra (mede RECALL: obra real que escapou). Descartável.

import { isEditalObra } from '../apps/api/dist/editais/obra/obra-classifier.js';

const UF = process.env.UF ?? 'SC';
const MOD = Number(process.env.MOD ?? 6);
const DIAS = Number(process.env.DIAS ?? 30);
const AMOSTRA = Number(process.env.AMOSTRA ?? 45);
const AMOSTRA_NEG = Number(process.env.AMOSTRA_NEG ?? 20);
const TAMANHO_PAGINA = 50;
const DELAY_MS = 700;
const TIMEOUT_MS = 45000;
const MAX_TENTATIVAS = 6;
const BACKOFF_MS = 3000;
const BASE_URL = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brl = (v) =>
  v == null ? 'sigiloso/null' : `R$ ${Number(v).toLocaleString('pt-BR')}`;

function formatarData(date) {
  const a = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${a}${m}${d}`;
}
function periodo() {
  const hoje = new Date();
  const inicio = new Date(Date.now() - DIAS * 86400000);
  return { dataInicial: formatarData(inicio), dataFinal: formatarData(hoje) };
}
const pct = (p, t) => (t === 0 ? '0%' : `${((p / t) * 100).toFixed(1)}%`);

// Amostra determinística (espaçada) para cobrir toda a lista, não só o topo.
function amostrar(arr, n) {
  if (arr.length <= n) return arr;
  const passo = arr.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * passo)]);
  return out;
}

async function buscarPagina(pagina, datas) {
  const params = new URLSearchParams({
    dataInicial: datas.dataInicial,
    dataFinal: datas.dataFinal,
    codigoModalidadeContratacao: String(MOD),
    uf: UF,
    pagina: String(pagina),
    tamanhoPagina: String(TAMANHO_PAGINA),
  });
  const url = `${BASE_URL}?${params.toString()}`;
  for (let t = 1; t <= MAX_TENTATIVAS; t++) {
    let resp;
    try {
      resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      if (t >= MAX_TENTATIVAS) throw new Error(`rede/timeout: ${e.message}`);
      await sleep(BACKOFF_MS * t);
      continue;
    }
    if (resp.status === 204) return { data: [], totalPaginas: 0, totalRegistros: 0 };
    if (resp.status === 429 || resp.status >= 500) {
      console.log(`    ⏳ HTTP ${resp.status} pág ${pagina} (${t}/${MAX_TENTATIVAS})`);
      await sleep(BACKOFF_MS * t);
      continue;
    }
    const txt = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    return JSON.parse(txt);
  }
  throw new Error(`falha persistente na página ${pagina}`);
}

async function buscarTodos(datas) {
  const primeira = await buscarPagina(1, datas);
  const total = primeira.totalPaginas ?? 0;
  const regs = [...(primeira.data ?? [])];
  for (let p = 2; p <= total; p++) {
    await sleep(DELAY_MS);
    try {
      regs.push(...((await buscarPagina(p, datas)).data ?? []));
    } catch (e) {
      console.error(`    ✖ parou na página ${p}/${total}: ${e.message}`);
      break;
    }
  }
  return regs;
}

function linha(r) {
  const obj = (r.objetoCompra ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `[${brl(r.valorTotalEstimado)}] ${obj}`;
}

async function main() {
  const datas = periodo();
  console.log(`T-125 precisão — UF=${UF} mod=${MOD} janela=${DIAS}d (${datas.dataInicial}–${datas.dataFinal})\n`);

  const regs = await buscarTodos(datas);
  const obras = [];
  const naoObras = [];
  for (const r of regs) {
    const ehObra = isEditalObra({
      fonte: 'PNCP',
      modalidadeId: r.modalidadeId ?? MOD,
      objeto: r.objetoCompra ?? '',
    });
    (ehObra ? obras : naoObras).push(r);
  }

  console.log(`total: ${regs.length}`);
  console.log(`classificados como OBRA: ${obras.length} (${pct(obras.length, regs.length)})`);
  console.log(`classificados como NÃO-obra: ${naoObras.length}\n`);

  console.log(`=== (A) AMOSTRA marcada OBRA — rotular p/ PRECISÃO (${Math.min(AMOSTRA, obras.length)}) ===`);
  for (const r of amostrar(obras, AMOSTRA)) console.log('  ✔ ' + linha(r));

  console.log(`\n=== (B) AMOSTRA marcada NÃO-obra — rotular p/ RECALL (${Math.min(AMOSTRA_NEG, naoObras.length)}) ===`);
  for (const r of amostrar(naoObras, AMOSTRA_NEG)) console.log('  · ' + linha(r));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
