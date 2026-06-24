// spikes/edital-ia.mjs
// Spike T-48 — IA extrai exigências de habilitação de editais reais.
//   Objetivo: medir, à mão, a taxa de acerto da IA extraindo as exigências de
//   habilitação de editais de verdade — ANTES de construir o serviço (T-49).
//   Provider: OpenAI (gpt-5.5), structured outputs estritos (JSON Schema).
//   Decisão de provider: dono em 24/06/2026 (ver CLAUDE.md §3.4).
//
// Rode com:  node spikes/edital-ia.mjs   (Node 20+, fetch nativo)
//   ALVO=5 node spikes/edital-ia.mjs     (quantos editais analisar)
//
// Dependencias: ZERO pacote npm. Reusa a pipeline de PDF do T-47 (endpoint de
// arquivos do PNCP -> PDF/ZIP -> pdftotext) e chama a API da OpenAI via fetch.
// A chave vem de spikes/.env (OPENAI_API_KEY=..., gitignored). NAO e codigo de
// producao — spike descartavel de validacao.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const execFileP = promisify(execFile);

// ---------------------------------------------------------------------------
// Parametros
// ---------------------------------------------------------------------------
const ALVO = Number(process.env.ALVO ?? 5); // quantos editais completos analisar
const MODELO = process.env.OPENAI_MODEL ?? 'gpt-5.5';
const PG_CONTAINER = process.env.PG_CONTAINER ?? 'obrapub-postgres';
const PG_USER = process.env.DATABASE_USER ?? 'obrapub';
const PG_DB = process.env.DATABASE_NAME ?? 'obrapub';

const PNCP_API = 'https://pncp.gov.br/api/pncp/v1';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 45000;
const OPENAI_TIMEOUT_MS = 180000;
const MAX_TENTATIVAS = 5;
const BACKOFF_MS = 2000;

const MIN_CHARS_USAVEL = 3000; // abaixo disso e so resumo/aviso (T-47) — pula
const MAX_CHARS_PROMPT = Number(process.env.MAX_CHARS_PROMPT ?? 300000); // teto de texto enviado (bound de custo)
const ONLY_ID = process.env.ONLY_ID ?? null; // se setado, analisa só esse numeroControlePNCP
const MAX_COMPLETION_TOKENS = 16000; // inclui tokens de reasoning do gpt-5.5
const CANDIDATOS = 20; // quantos editais buscar p/ achar ALVO completos

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Carregar OPENAI_API_KEY do spikes/.env (sem dep dotenv)
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
// Pipeline de PDF do PNCP (reaproveitada do T-47)
// ---------------------------------------------------------------------------
async function lerCandidatos() {
  const sql = `SELECT id_externo || E'\\t' || left(replace(objeto, E'\\n', ' '), 90)
               FROM editais WHERE is_obra = true
               ORDER BY data_publicacao DESC LIMIT ${CANDIDATOS};`;
  const { stdout } = await execFileP('docker', [
    'exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-t', '-A', '-c', sql,
  ]);
  return stdout.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [idExterno, objeto] = l.split('\t');
    return { idExterno, objeto: objeto ?? '' };
  });
}

function parseControle(n) {
  const m = /^(\d+)-\d+-(\d+)\/(\d+)$/.exec(n);
  return m ? { cnpj: m[1], sequencial: String(Number(m[2])), ano: m[3] } : null;
}

async function fetchBackoff(url, opts = {}) {
  for (let t = 1; t <= MAX_TENTATIVAS; t++) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...opts });
    if (resp.status === 429) { await sleep(BACKOFF_MS * t); continue; }
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

// Quando varios docs sao tipo "Edital" (projeto executivo, ART, edital...),
// preferir o que realmente e o EDITAL: titulo "edital" e que NAO pareca
// projeto/anexo. Achado da T-48 — vira regra do servico na T-49.
function escolherEdital(arquivos) {
  const ativos = arquivos.filter((a) => a.statusAtivo !== false);
  const lista = ativos.length ? ativos : arquivos;
  const naoEdital = /executiv|projeto|memorial|planilha|cronograma|\bart\b|or[çc]ament|anexo|mapa|plant|caderno|estudo/i;
  const porTitulo = lista.find((a) => /edital/i.test(a.titulo ?? '') && !naoEdital.test(a.titulo ?? ''));
  if (porTitulo) return porTitulo;
  const porTipo = lista.find((a) => /edital/i.test(a.tipoDocumentoNome ?? '') && !naoEdital.test(a.titulo ?? ''));
  if (porTipo) return porTipo;
  return lista[0] ?? null;
}

const ehPdf = (b) => b.length >= 4 && b.toString('latin1', 0, 4) === '%PDF';
const ehZip = (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

async function listarPdfs(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listarPdfs(p)));
    else if (/\.pdf$/i.test(e.name)) out.push(p);
  }
  return out;
}

async function escolherPdfPrincipal(pdfs) {
  const edital = pdfs.find((p) => /edital/i.test(basename(p)));
  if (edital) return edital;
  const comTam = await Promise.all(pdfs.map(async (p) => ({ p, size: (await stat(p)).size })));
  comTam.sort((a, b) => b.size - a.size);
  return comTam[0]?.p ?? null;
}

async function resolverPdf(buffer, dir, idx) {
  if (ehPdf(buffer)) {
    const c = join(dir, `${idx}.pdf`);
    await writeFile(c, buffer);
    return c;
  }
  if (ehZip(buffer)) {
    const zip = join(dir, `${idx}.zip`);
    const dest = join(dir, `${idx}-zip`);
    await writeFile(zip, buffer);
    try { await execFileP('unzip', ['-o', '-qq', zip, '-d', dest]); } catch { return null; }
    const pdfs = await listarPdfs(dest);
    return pdfs.length ? await escolherPdfPrincipal(pdfs) : null;
  }
  return null;
}

async function textoDoEdital(idExterno, dir, idx) {
  const partes = parseControle(idExterno);
  if (!partes) return null;
  const arquivos = await listarArquivos(partes);
  if (!arquivos.length) return null;
  const doc = escolherEdital(arquivos);
  const resp = await fetchBackoff(doc.url ?? doc.uri, { headers: { Accept: '*/*' } });
  if (!resp.ok) return null;
  const buffer = Buffer.from(await resp.arrayBuffer());
  const caminho = await resolverPdf(buffer, dir, idx);
  if (!caminho) return null;
  const { stdout } = await execFileP('pdftotext', ['-q', caminho, '-'], { maxBuffer: 128 * 1024 * 1024 });
  return stdout.replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// IA — extracao estruturada das exigencias de habilitacao (OpenAI)
// ---------------------------------------------------------------------------
const SYSTEM = `Você é um analista de licitações de OBRA PÚBLICA no Brasil (Lei 14.133/2021).
Sua tarefa: extrair APENAS as exigências de HABILITAÇÃO que o edital realmente declara
(os documentos e condições que a empresa precisa cumprir para participar e ser habilitada).
Regras:
- NÃO invente. Se o edital não menciona um item, marque "exigida": false (ou "exigido": false).
- Sempre que afirmar que algo é exigido, copie um TRECHO CURTO e literal do edital como evidência no campo "trecho".
- Foque em habilitação (jurídica, fiscal/trabalhista, econômico-financeira, técnica), não no objeto da obra.
- Responda em português, no formato JSON do schema fornecido.`;

const SCHEMA = {
  name: 'exigencias_habilitacao',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['resumo_objeto', 'certidoes', 'registro_conselho', 'capacidade_tecnica', 'capital_social', 'garantia', 'outros_requisitos'],
    properties: {
      resumo_objeto: { type: 'string', description: 'Objeto da licitação em 1 frase' },
      certidoes: {
        type: 'array',
        description: 'Certidões/regularidades exigidas para habilitação',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['tipo', 'exigida', 'trecho'],
          properties: {
            tipo: { type: 'string', enum: ['cnd_federal', 'fgts', 'trabalhista', 'estadual', 'municipal', 'falencia', 'outra'] },
            exigida: { type: 'boolean' },
            trecho: { type: ['string', 'null'] },
          },
        },
      },
      registro_conselho: {
        type: 'object',
        additionalProperties: false,
        required: ['exigido', 'conselho', 'trecho'],
        properties: {
          exigido: { type: 'boolean' },
          conselho: { type: ['string', 'null'], description: 'CREA, CAU, ambos, ou null' },
          trecho: { type: ['string', 'null'] },
        },
      },
      capacidade_tecnica: {
        type: 'object',
        additionalProperties: false,
        required: ['exigida', 'descricao', 'trecho'],
        properties: {
          exigida: { type: 'boolean' },
          descricao: { type: ['string', 'null'], description: 'O que os atestados precisam comprovar' },
          trecho: { type: ['string', 'null'] },
        },
      },
      capital_social: {
        type: 'object',
        additionalProperties: false,
        required: ['exigido', 'valor_minimo_reais', 'percentual_sobre_estimado', 'trecho'],
        properties: {
          exigido: { type: 'boolean' },
          valor_minimo_reais: { type: ['number', 'null'] },
          percentual_sobre_estimado: { type: ['number', 'null'] },
          trecho: { type: ['string', 'null'] },
        },
      },
      garantia: {
        type: 'object',
        additionalProperties: false,
        required: ['exigida', 'trecho'],
        properties: {
          exigida: { type: 'boolean' },
          trecho: { type: ['string', 'null'] },
        },
      },
      outros_requisitos: {
        type: 'array',
        description: 'Outras exigências de habilitação não cobertas acima',
        items: { type: 'string' },
      },
    },
  },
};

async function extrairExigencias(texto) {
  const trunc = texto.length > MAX_CHARS_PROMPT;
  const corpo = trunc ? texto.slice(0, MAX_CHARS_PROMPT) : texto;
  const body = {
    model: MODELO,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Edital (texto extraído do PDF):\n\n${corpo}` },
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
  return {
    parsed: content ? JSON.parse(content) : null,
    finish: choice?.finish_reason,
    usage: json.usage,
    truncado: trunc,
  };
}

// Preços por MTok (input/output) — jun/2026. Reasoning conta como output.
const PRECOS = {
  'gpt-5.5': [5, 30],
  'gpt-5.4': [2.5, 15],
  'gpt-5.4-mini': [0.75, 4.5],
  'gpt-5.4-nano': [0.2, 1.25],
};
function custoUsd(usage) {
  if (!usage) return 0;
  const [inp, out] = PRECOS[MODELO] ?? PRECOS['gpt-5.5'];
  return (usage.prompt_tokens / 1e6) * inp + (usage.completion_tokens / 1e6) * out;
}

// ---------------------------------------------------------------------------
// Verificação anti-alucinação: cada `trecho` citado pela IA tem que existir
// LITERALMENTE no texto do edital. Se não existir, a IA inventou a evidência.
// ---------------------------------------------------------------------------
function normaliza(s) {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[""''«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function coletarTrechos(p) {
  const out = [];
  if (!p) return out;
  for (const c of p.certidoes ?? []) if (c.exigida && c.trecho) out.push(c.trecho);
  for (const k of ['registro_conselho', 'capacidade_tecnica', 'capital_social', 'garantia']) {
    const o = p[k];
    if (o && (o.exigida || o.exigido) && o.trecho) out.push(o.trecho);
  }
  return out;
}

// Quebra o trecho por "[...]"/"..." e checa se cada fragmento (>=12 chars)
// aparece no texto normalizado. null = trecho curto demais p/ verificar.
function trechoConfere(trecho, textoNorm) {
  const frags = normaliza(trecho)
    .replace(/"/g, ' ')
    .split(/\[\.\.\.\]|\.\.\.|…/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 12);
  if (!frags.length) return null;
  return frags.every((f) => textoNorm.includes(f));
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------
async function main() {
  await carregarEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error('✖ OPENAI_API_KEY ausente. Defina em spikes/.env (OPENAI_API_KEY=...).');
    process.exit(1);
  }
  console.log(`Spike T-48 — IA extrai exigências de habilitação (provider: OpenAI ${MODELO})\n`);

  const dir = await mkdtemp(join(tmpdir(), 'spike-edital-ia-'));
  let candidatos = await lerCandidatos();
  if (ONLY_ID) candidatos = candidatos.filter((c) => c.idExterno === ONLY_ID);
  const analisados = [];
  let custoTotal = 0;

  for (let i = 0; i < candidatos.length && analisados.length < ALVO; i++) {
    const ed = candidatos[i];
    process.stdout.write(`\n[${analisados.length + 1}/${ALVO}] ${ed.idExterno} — baixando/extraindo... `);
    let texto;
    try {
      texto = await textoDoEdital(ed.idExterno, dir, i);
    } catch (e) {
      console.log(`✖ erro no PDF: ${e.message}`);
      continue;
    }
    if (!texto || texto.length < MIN_CHARS_USAVEL) {
      console.log(`⚪ pulando (só resumo/sem PDF útil, ${texto?.length ?? 0} chars)`);
      continue;
    }
    if (process.env.DUMP_DIR) {
      const nome = ed.idExterno.replace(/[^0-9]/g, '_') + '.txt';
      await writeFile(join(process.env.DUMP_DIR, nome), texto);
      console.log(`(dump ${texto.length} chars → ${nome})`);
      analisados.push({ ...ed });
      continue;
    }
    process.stdout.write(`${texto.length} chars → IA... `);
    try {
      const { parsed, finish, usage, truncado } = await extrairExigencias(texto);
      const custo = custoUsd(usage);
      custoTotal += custo;
      console.log(`✓ (finish=${finish}, ${usage?.prompt_tokens}+${usage?.completion_tokens} tok, ~$${custo.toFixed(3)}${truncado ? ', TEXTO TRUNCADO' : ''})`);
      console.log(`  Objeto: ${ed.objeto}`);
      console.log('  Exigências extraídas pela IA:');
      console.log(JSON.stringify(parsed, null, 2).split('\n').map((l) => '    ' + l).join('\n'));

      // Verificação anti-alucinação: os trechos citados existem no edital?
      const textoNorm = normaliza(texto);
      const trechos = coletarTrechos(parsed);
      const checados = trechos.map((t) => ({ t, ok: trechoConfere(t, textoNorm) }));
      const verificaveis = checados.filter((c) => c.ok !== null);
      const ok = verificaveis.filter((c) => c.ok).length;
      const falhas = verificaveis.filter((c) => !c.ok);
      console.log(`  ✔ Verificação: ${ok}/${verificaveis.length} trechos citados existem LITERALMENTE no edital.`);
      if (falhas.length) {
        console.log('    ⚠ trechos NÃO encontrados (possível alucinação ou paráfrase):');
        falhas.forEach((c) => console.log(`      - ${c.t.slice(0, 110)}`));
      }
      analisados.push({ ...ed, parsed, finish, truncado, trechosOk: ok, trechosTotal: verificaveis.length });
    } catch (e) {
      console.log(`✖ erro na IA: ${e.message}`);
    }
  }

  const totOk = analisados.reduce((s, a) => s + (a.trechosOk ?? 0), 0);
  const totTr = analisados.reduce((s, a) => s + (a.trechosTotal ?? 0), 0);
  console.log(`\n${'='.repeat(70)}\nRESUMO\n${'='.repeat(70)}`);
  console.log(`  Editais analisados pela IA: ${analisados.length}/${ALVO}`);
  console.log(`  Custo total estimado: ~$${custoTotal.toFixed(3)} (${MODELO})`);
  console.log(`  Truncados (texto > ${MAX_CHARS_PROMPT} chars): ${analisados.filter((a) => a.truncado).length}`);
  console.log(`  ✔ Trechos citados que existem no edital: ${totOk}/${totTr} (${totTr ? ((totOk / totTr) * 100).toFixed(1) : 0}%) — mede alucinação de evidência`);
  console.log('\n  PRÓXIMO PASSO (humano): abrir cada PDF na fonte e conferir, item a item,');
  console.log('  se a IA acertou (certidões, CREA/CAU, capacidade técnica, capital, garantia).');
  console.log('  A taxa de acerto é o que decide se seguimos pro T-49 (CLAUDE.md §3.4).');

  await rm(dir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error('Falha no spike:', e);
  process.exit(1);
});
