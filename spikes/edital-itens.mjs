// spikes/edital-itens.mjs
// Spike T-63 (Épico 6) — A IA consegue extrair a PLANILHA DE ITENS do edital?
//   Objetivo: medir (1) a taxa de acerto da IA extraindo os itens da planilha
//   orçamentária (descrição, unidade, quantidade) e (2) quão comum a planilha
//   vem em formato NÃO extraível como texto (Excel separado) vs PDF.
//   Provider: OpenAI gpt-5.4-mini (o de produção — CLAUDE.md §3.4).
//
// Rode com:  node spikes/edital-itens.mjs
//   ALVO=5 CANDIDATOS=30 OPENAI_MODEL=gpt-5.4-mini node spikes/edital-itens.mjs
//   ONLY_ID="<numeroControlePNCP>" node spikes/edital-itens.mjs
//
// Dependências: ZERO pacote npm. Reusa a pipeline de PDF do T-47/T-48 (endpoint
// de arquivos do PNCP → PDF/ZIP → pdftotext) e adiciona um parser XLSX em Node
// puro (unzip + XML). Chave em spikes/.env (OPENAI_API_KEY=...). NÃO é código de
// produção — spike descartável de validação.
//
// DIFERENÇA-CHAVE p/ o T-48: lá excluíamos planilha/orçamento/anexo p/ achar o
// EDITAL. Aqui é o oposto — buscamos justamente o anexo de PLANILHA orçamentária.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  writeFile,
  rm,
  readFile,
  readdir,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const execFileP = promisify(execFile);

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------
const ALVO = Number(process.env.ALVO ?? 5); // quantas extrações por IA fazer
const CANDIDATOS = Number(process.env.CANDIDATOS ?? 30); // quantos editais inventariar
const MODELO = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';
const PG_CONTAINER = process.env.PG_CONTAINER ?? 'obrapub-postgres';
const PG_USER = process.env.DATABASE_USER ?? 'obrapub';
const PG_DB = process.env.DATABASE_NAME ?? 'obrapub';

const PNCP_API = 'https://pncp.gov.br/api/pncp/v1';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 45000;
const OPENAI_TIMEOUT_MS = 180000;
const MAX_TENTATIVAS = 5;
const BACKOFF_MS = 2000;

const MAX_CHARS_PROMPT = Number(process.env.MAX_CHARS_PROMPT ?? 250000);
const MAX_DOWNLOAD_BYTES = 60 * 1024 * 1024; // pula download enorme (projeto executivo)
const MAX_COMPLETION_TOKENS = 32000; // planilhas têm muitos itens
const ONLY_ID = process.env.ONLY_ID ?? null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Seleção da planilha orçamentária (de itens/quantitativos). É o INVERSO da
// T-48: lá excluíamos planilha/orçamento p/ achar o edital. Aqui pontuamos os
// nomes — e EXCLUÍMOS os falsos positivos que a v1 do spike pegou por engano
// (ART, BDI, composições, banco de preços, cronograma, pesquisa/cotação de
// preço, cálculos, e a "planilha dos licitantes" que é só o template vazio).
const REGEX_EXCLUI =
  /composi|\bbdi\b|banco.?de.?pre[çc]|cronograma|\bart\b|\brrt\b|\btrt\b|pesquisa.?de.?pre[çc]|cota[çc]|c[áa]lculo|blindagem|licitante|\bmodelo\b|memorial|\betp\b|estudo.?t[ée]cnico|termo.?de.?refer|minuta/i;

function scoreNome(nome) {
  const n = nome ?? '';
  if (REGEX_EXCLUI.test(n)) return -1;
  if (/planilha.*(or[çc]ament|quantitat|pre[çc]o)|or[çc]ament.*sint[ée]t/i.test(n)) return 3;
  if (/\bor[çc]amento\b/i.test(n)) return 2;
  if (/planilha|quantitativ/i.test(n)) return 1;
  return 0; // ex.: o próprio PDF do edital — não é a planilha de itens
}

const rankTipo = (t) => (t === 'xlsx' ? 2 : t === 'pdf' ? 1 : 0);

// ---------------------------------------------------------------------------
// .env (sem dep dotenv)
// ---------------------------------------------------------------------------
async function carregarEnv() {
  try {
    const txt = await readFile(new URL('./.env', import.meta.url), 'utf8');
    for (const linha of txt.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
      if (m && !linha.trim().startsWith('#') && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* sem .env — usa o ambiente */
  }
}

// ---------------------------------------------------------------------------
// Candidatos do banco (com valor estimado p/ a checagem soma × valor)
// ---------------------------------------------------------------------------
async function lerCandidatos() {
  const sql = `SELECT id_externo || E'\\t' || coalesce(valor_estimado::text,'') || E'\\t'
               || left(replace(objeto, E'\\n',' '), 90)
               FROM editais WHERE is_obra = true AND valor_estimado IS NOT NULL
               ORDER BY data_publicacao DESC LIMIT ${CANDIDATOS};`;
  const { stdout } = await execFileP('docker', [
    'exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-t', '-A', '-c', sql,
  ]);
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [idExterno, valor, objeto] = l.split('\t');
      return { idExterno, valorEstimado: valor ? Number(valor) : null, objeto: objeto ?? '' };
    });
}

function parseControle(n) {
  const m = /^(\d+)-\d+-(\d+)\/(\d+)$/.exec(n);
  return m ? { cnpj: m[1], sequencial: String(Number(m[2])), ano: m[3] } : null;
}

async function fetchBackoff(url, opts = {}) {
  for (let t = 1; t <= MAX_TENTATIVAS; t++) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...opts });
    if (resp.status === 429) {
      await sleep(BACKOFF_MS * t);
      continue;
    }
    return resp;
  }
  throw new Error(`429 persistente em ${url}`);
}

async function listarArquivos({ cnpj, ano, sequencial }) {
  const url = `${PNCP_API}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`;
  const resp = await fetchBackoff(url, { headers: { Accept: 'application/json' } });
  if (resp.status === 404 || resp.status === 204) return [];
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao listar arquivos`);
  const json = await resp.json();
  return Array.isArray(json) ? json : [];
}

// ---------------------------------------------------------------------------
// Detecção de formato por magic bytes
// ---------------------------------------------------------------------------
const ehPdf = (b) => b.length >= 4 && b.toString('latin1', 0, 4) === '%PDF';
const ehZip = (b) =>
  b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);
const ehOle2 = (b) =>
  b.length >= 8 &&
  b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 &&
  b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;

// Baixa um arquivo; pula se for grande demais e não parecer planilha.
async function baixar(arquivo) {
  const url = arquivo.url ?? arquivo.uri;
  if (!url) return null;
  const resp = await fetchBackoff(url, { headers: { Accept: '*/*' } });
  if (!resp.ok) return null;
  const len = Number(resp.headers.get('content-length') ?? 0);
  if (len > MAX_DOWNLOAD_BYTES && scoreNome(arquivo.titulo ?? '') <= 0) {
    return { grande: true };
  }
  return { buffer: Buffer.from(await resp.arrayBuffer()) };
}

// ---------------------------------------------------------------------------
// Parser XLSX em Node puro (unzip + XML). Best-effort: lê sharedStrings + todas
// as worksheets e devolve as linhas como texto (células separadas por TAB).
// ---------------------------------------------------------------------------
function decodeXml(s) {
  return (s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  const out = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const textos = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    out.push(decodeXml(textos.join('')));
  }
  return out;
}

function sheetParaTexto(xml, shared) {
  const linhas = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const celulas = [];
    for (const c of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1];
      const inner = c[2];
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      let valor = '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if (t === 's') {
        valor = shared[Number(v)] ?? '';
      } else if (t === 'inlineStr') {
        valor = decodeXml(
          [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''),
        );
      } else if (v != null) {
        valor = decodeXml(v);
      }
      if (valor !== '') celulas.push(valor);
    }
    if (celulas.length) linhas.push(celulas.join('\t'));
  }
  return linhas.join('\n');
}

async function extrairXlsx(xlsxPath, dir, tag) {
  const dest = join(dir, `${tag}-xlsx`);
  await execFileP('unzip', ['-o', '-qq', xlsxPath, '-d', dest]);
  let shared = [];
  try {
    shared = parseSharedStrings(await readFile(join(dest, 'xl', 'sharedStrings.xml'), 'utf8'));
  } catch {
    /* sem sharedStrings — planilha só com números */
  }
  const sheetsDir = join(dest, 'xl', 'worksheets');
  let nomes = [];
  try {
    nomes = (await readdir(sheetsDir)).filter((n) => /\.xml$/i.test(n)).sort();
  } catch {
    return '';
  }
  let texto = '';
  for (const n of nomes) {
    const t = sheetParaTexto(await readFile(join(sheetsDir, n), 'utf8'), shared);
    if (t.trim()) texto += `# ${n}\n${t}\n`;
  }
  return texto.trim();
}

// É um .xlsx (ZIP com xl/workbook.xml)?
async function ehXlsxDir(dir) {
  try {
    await stat(join(dir, 'xl', 'workbook.xml'));
    return true;
  } catch {
    return false;
  }
}

async function listarRec(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listarRec(p)));
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Acha a planilha orçamentária do edital e devolve formato + texto (se extraível).
//   formato: 'pdf' | 'xlsx' | 'xls' | 'ods' | 'nenhum'
//   extraivel: bool ; texto: string|null
// ---------------------------------------------------------------------------
async function acharPlanilha(arquivos, dir, idx) {
  const fontes = []; // { nome, score, tipo:'pdf'|'xlsx'|'xls', path? }
  let viuXls = false;

  for (let i = 0; i < arquivos.length; i++) {
    const arq = arquivos[i];
    const titulo = arq.titulo ?? arq.tipoDocumentoNome ?? `arquivo-${i}`;
    const sc = scoreNome(titulo);
    if (sc < 0) continue; // falso positivo conhecido (ART, BDI, composições…)
    let baixado;
    try {
      baixado = await baixar(arq);
    } catch {
      continue;
    }
    if (!baixado || baixado.grande || !baixado.buffer) continue;
    const buf = baixado.buffer;
    const tag = `${idx}-${i}`;

    if (ehPdf(buf)) {
      if (sc > 0) {
        const p = join(dir, `${tag}.pdf`);
        await writeFile(p, buf);
        fontes.push({ nome: titulo, score: sc, tipo: 'pdf', path: p });
      }
      continue;
    }
    if (ehOle2(buf)) {
      viuXls = true;
      if (sc > 0) fontes.push({ nome: titulo, score: sc, tipo: 'xls' });
      continue;
    }
    if (ehZip(buf)) {
      const zipPath = join(dir, `${tag}.zip`);
      const zdir = join(dir, `${tag}-z`);
      await writeFile(zipPath, buf);
      try {
        await execFileP('unzip', ['-o', '-qq', zipPath, '-d', zdir]);
      } catch {
        continue;
      }
      // O próprio arquivo é um .xlsx (zip com xl/workbook.xml)
      if (await ehXlsxDir(zdir)) {
        if (sc > 0 || /\.xlsx$/i.test(titulo)) {
          fontes.push({ nome: titulo, score: Math.max(sc, 1), tipo: 'xlsx', path: zipPath });
        }
        continue;
      }
      // ZIP de anexos — pontuar cada entrada interna
      for (const p of await listarRec(zdir)) {
        const nome = basename(p);
        const s = scoreNome(nome);
        if (s <= 0) {
          if (/\.xls$/i.test(nome)) viuXls = true;
          continue;
        }
        if (/\.xlsx$/i.test(nome)) fontes.push({ nome, score: s, tipo: 'xlsx', path: p });
        else if (/\.pdf$/i.test(nome)) fontes.push({ nome, score: s, tipo: 'pdf', path: p });
        else if (/\.xls$/i.test(nome)) {
          viuXls = true;
          fontes.push({ nome, score: s, tipo: 'xls' });
        }
      }
    }
  }

  if (!fontes.length) return { formato: viuXls ? 'xls' : 'nenhum', extraivel: false, texto: null, nome: null };

  // Melhor candidato: maior score; desempate por formato (xlsx > pdf > xls).
  fontes.sort((a, b) => b.score - a.score || rankTipo(b.tipo) - rankTipo(a.tipo));
  const best = fontes[0];
  if (best.tipo === 'xls') return { formato: 'xls', extraivel: false, texto: null, nome: best.nome };

  let texto = null;
  try {
    if (best.tipo === 'pdf') {
      const { stdout } = await execFileP('pdftotext', ['-q', '-layout', best.path, '-'], {
        maxBuffer: 128 * 1024 * 1024,
      });
      texto = stdout.replace(/\n{3,}/g, '\n\n').trim();
    } else if (best.tipo === 'xlsx') {
      texto = await extrairXlsx(best.path, dir, `${idx}-best`);
    }
  } catch {
    /* extração falhou — fica como não-extraível */
  }
  return { formato: best.tipo, extraivel: Boolean(texto), texto: texto || null, nome: best.nome };
}

// ---------------------------------------------------------------------------
// IA — extração estruturada dos itens da planilha (OpenAI)
// ---------------------------------------------------------------------------
const SYSTEM = `Você extrai a PLANILHA ORÇAMENTÁRIA (relação de itens de serviço) de um edital de OBRA pública.
Para CADA item/linha da planilha, devolva: código (se houver), descrição do serviço, unidade (m², m³, vb, kg...),
quantidade e o preço unitário de referência (se a planilha trouxer os preços do orçamento-base).
Regras:
- NÃO invente itens. Extraia somente linhas que existem na planilha do texto fornecido.
- Ignore cabeçalhos de coluna, subtotais, totais, BDI e rodapés — só os itens de serviço.
- Se o texto NÃO contém uma planilha de itens (ex.: é só o edital, sem a relação), responda tem_planilha=false e itens=[].
- Números no padrão brasileiro (1.234,56) devem virar number (1234.56).`;

const SCHEMA = {
  name: 'planilha_orcamentaria',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tem_planilha', 'itens'],
    properties: {
      tem_planilha: { type: 'boolean' },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['codigo', 'descricao', 'unidade', 'quantidade', 'preco_unitario_referencia'],
          properties: {
            codigo: { type: ['string', 'null'] },
            descricao: { type: 'string' },
            unidade: { type: ['string', 'null'] },
            quantidade: { type: ['number', 'null'] },
            preco_unitario_referencia: { type: ['number', 'null'] },
          },
        },
      },
    },
  },
};

async function extrairItens(texto) {
  const trunc = texto.length > MAX_CHARS_PROMPT;
  const corpo = trunc ? texto.slice(0, MAX_CHARS_PROMPT) : texto;
  const body = {
    model: MODELO,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Texto da planilha/edital:\n\n${corpo}` },
    ],
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    max_completion_tokens: MAX_COMPLETION_TOKENS,
  };
  const resp = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}: ${JSON.stringify(json.error ?? json).slice(0, 400)}`);
  const choice = json.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`Recusa: ${choice.message.refusal}`);
  const content = choice?.message?.content;
  return { parsed: content ? JSON.parse(content) : null, finish: choice?.finish_reason, usage: json.usage, truncado: trunc };
}

const PRECOS = {
  'gpt-5.5': [5, 30],
  'gpt-5.4': [2.5, 15],
  'gpt-5.4-mini': [0.75, 4.5],
  'gpt-5.4-nano': [0.2, 1.25],
};
function custoUsd(usage) {
  if (!usage) return 0;
  const [inp, out] = PRECOS[MODELO] ?? PRECOS['gpt-5.4-mini'];
  return (usage.prompt_tokens / 1e6) * inp + (usage.completion_tokens / 1e6) * out;
}

// Soma(qtd × preço_ref) dos itens — comparada ao valor estimado do edital,
// é um sinal automático de extração completa (sem preços, retorna null).
function somaReferencia(itens) {
  let soma = 0;
  let comPreco = 0;
  for (const it of itens ?? []) {
    if (typeof it.quantidade === 'number' && typeof it.preco_unitario_referencia === 'number') {
      soma += it.quantidade * it.preco_unitario_referencia;
      comPreco++;
    }
  }
  return comPreco ? { soma, comPreco } : null;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
async function main() {
  await carregarEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error('✖ OPENAI_API_KEY ausente. Defina em spikes/.env (OPENAI_API_KEY=...).');
    process.exit(1);
  }
  console.log(`Spike T-63 — IA extrai a planilha de itens (provider: OpenAI ${MODELO})\n`);

  const dir = await mkdtemp(join(tmpdir(), 'spike-edital-itens-'));
  let candidatos = await lerCandidatos();
  if (ONLY_ID) candidatos = candidatos.filter((c) => c.idExterno === ONLY_ID);

  const inventario = []; // { idExterno, formato, extraivel }
  const extracoes = [];
  let custoTotal = 0;

  for (const ed of candidatos) {
    const partes = parseControle(ed.idExterno);
    if (!partes) continue;
    process.stdout.write(`\n${ed.idExterno} — listando arquivos... `);
    let arquivos;
    try {
      arquivos = await listarArquivos(partes);
    } catch (e) {
      console.log(`✖ ${e.message}`);
      continue;
    }
    if (!arquivos.length) {
      console.log('⚪ sem arquivos');
      inventario.push({ idExterno: ed.idExterno, formato: 'sem_arquivos', extraivel: false });
      continue;
    }
    let pl;
    try {
      pl = await acharPlanilha(arquivos, dir, inventario.length);
    } catch (e) {
      console.log(`✖ erro: ${e.message}`);
      continue;
    }
    inventario.push({ idExterno: ed.idExterno, formato: pl.formato, extraivel: pl.extraivel });
    console.log(`planilha: ${pl.formato}${pl.extraivel ? ' (extraível)' : ''}${pl.nome ? ` — ${pl.nome}` : ''}`);

    // Extração por IA só nos extraíveis, até atingir ALVO
    if (pl.extraivel && pl.texto && extracoes.length < ALVO) {
      process.stdout.write(`  → IA (${pl.texto.length} chars)... `);
      try {
        const { parsed, finish, usage, truncado } = await extrairItens(pl.texto);
        const custo = custoUsd(usage);
        custoTotal += custo;
        const nItens = parsed?.itens?.length ?? 0;
        const soma = somaReferencia(parsed?.itens);
        console.log(
          `✓ ${nItens} itens (finish=${finish}, ${usage?.prompt_tokens}+${usage?.completion_tokens} tok, ~$${custo.toFixed(3)}${truncado ? ', TRUNCADO' : ''})`,
        );
        let ratioStr = 'sem preços de referência';
        let ratio = null;
        if (soma && ed.valorEstimado) {
          ratio = soma.soma / ed.valorEstimado;
          ratioStr = `soma(qtd×preço)=R$${soma.soma.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} vs valorEstimado=R$${ed.valorEstimado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} → ${(ratio * 100).toFixed(0)}% (${soma.comPreco}/${nItens} itens c/ preço)`;
        }
        console.log(`    objeto: ${ed.objeto}`);
        console.log(`    completude: ${ratioStr}`);
        // amostra dos 3 primeiros itens p/ inspeção rápida
        for (const it of (parsed?.itens ?? []).slice(0, 3)) {
          console.log(
            `      • ${it.codigo ? it.codigo + ' ' : ''}${(it.descricao ?? '').slice(0, 70)} | ${it.unidade ?? '—'} | qtd ${it.quantidade ?? '—'} | R$ ${it.preco_unitario_referencia ?? '—'}`,
          );
        }
        // dump do texto-fonte + JSON p/ sign-off humano
        const base = ed.idExterno.replace(/[^0-9]/g, '_');
        await writeFile(join(dir, `${base}.fonte.txt`), pl.texto);
        await writeFile(join(dir, `${base}.itens.json`), JSON.stringify(parsed, null, 2));
        extracoes.push({ ...ed, formato: pl.formato, nItens, finish, truncado, ratio, soma });
      } catch (e) {
        console.log(`✖ erro na IA: ${e.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Resumo
  // -------------------------------------------------------------------------
  const cont = (f) => inventario.filter((i) => i.formato === f).length;
  const total = inventario.length;
  console.log(`\n${'='.repeat(72)}\nRESUMO\n${'='.repeat(72)}`);
  console.log(`\n[1] Inventário de formatos da planilha (${total} editais de obra):`);
  console.log(`  PDF (extraível como texto) ........ ${cont('pdf')}`);
  console.log(`  XLSX (Excel moderno, extraído) .... ${cont('xlsx')}`);
  console.log(`  XLS (Excel binário, NÃO extraído) . ${cont('xls')}`);
  console.log(`  ODS / outro ....................... ${cont('ods')}`);
  console.log(`  Nenhuma planilha como anexo ....... ${cont('nenhum')}`);
  console.log(`  Sem arquivos no PNCP .............. ${cont('sem_arquivos')}`);
  const extraiveis = inventario.filter((i) => i.extraivel).length;
  console.log(
    `  → ${extraiveis}/${total} (${total ? ((extraiveis / total) * 100).toFixed(0) : 0}%) têm planilha EXTRAÍVEL como texto`,
  );

  console.log(`\n[2] Extração por IA (${extracoes.length} planilhas):`);
  console.log(`  Custo total: ~$${custoTotal.toFixed(3)} (${MODELO})`);
  for (const e of extracoes) {
    console.log(
      `  • ${e.idExterno} [${e.formato}] — ${e.nItens} itens${e.truncado ? ' (TRUNCADO)' : ''}${e.ratio != null ? ` — completude ${(e.ratio * 100).toFixed(0)}%` : ''}`,
    );
  }
  console.log(`\n  Dumps (texto-fonte + JSON) p/ sign-off humano em: ${dir}`);
  console.log('  PRÓXIMO PASSO (humano): abrir um .fonte.txt e o .itens.json lado a lado e');
  console.log('  conferir se a IA pegou descrição/unidade/quantidade certas, sem inventar/pular itens.');
  console.log(`  (Os dumps NÃO são apagados — rode: rm -rf ${dir} quando terminar.)`);
}

main().catch((e) => {
  console.error('Falha no spike:', e);
  process.exit(1);
});
