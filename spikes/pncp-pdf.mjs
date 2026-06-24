// spikes/pncp-pdf.mjs
// Spike T-47 — baixar o PDF do edital e extrair texto.
//   Objetivo: descobrir QUE % dos editais reais (no banco) tem PDF com texto
//   extraivel, vs. escaneado (imagem, exigiria OCR), vs. sem documento util.
//   E o insumo de validacao ANTES de construir a extracao com IA (T-48/T-49).
//
// Rode com:  node spikes/pncp-pdf.mjs   (Node 20+, fetch nativo)
//   AMOSTRA=60 node spikes/pncp-pdf.mjs   (ajusta o tamanho da amostra)
//
// Dependencias: ZERO pacote npm. Usa o Postgres do Docker (via `docker exec
// psql`) para a amostra e ferramentas de sistema (`pdftotext`/`pdfinfo` do
// poppler, `unzip`) para extrair o texto. NAO e codigo de producao — spike
// descartavel. A extracao de producao (T-49) decidira a abordagem Node-native;
// aqui so medimos a viabilidade com a ferramenta mais direta.
//
// Achado durante o spike: boa parte dos editais do PNCP vem empacotada num ZIP
// (edital + anexos), nao como PDF solto. Por isso o spike descompacta e procura
// o PDF do edital dentro do ZIP.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const execFileP = promisify(execFile);

// ---------------------------------------------------------------------------
// Parametros configuraveis
// ---------------------------------------------------------------------------
const AMOSTRA = Number(process.env.AMOSTRA ?? 40); // quantos editais investigar
const PG_CONTAINER = process.env.PG_CONTAINER ?? 'obrapub-postgres';
const PG_USER = process.env.DATABASE_USER ?? 'obrapub';
const PG_DB = process.env.DATABASE_NAME ?? 'obrapub';

const PNCP_API = 'https://pncp.gov.br/api/pncp/v1'; // API principal (arquivos)
const TIMEOUT_MS = 45000;
const MAX_TENTATIVAS = 5; // re-tentativas no 429 antes de desistir
const BACKOFF_MS = 2000; // espera base no 429 (multiplicada pela tentativa)
const DELAY_MS = 400; // pausa entre editais (educado com a API)

// Limiares de classificacao do texto extraido.
const MIN_CHARS_TOTAL = 1500; // abaixo disso nao ha edital completo p/ a IA ler
const MIN_CHARS_POR_PAGINA = 200; // pouco texto/pagina
const MAX_CHARS_ESCANEADO = 80; // ~zero texto/pagina => imagem (precisa OCR)

// Classifica o resultado da extracao em 3 estados:
//   texto_ok    -> edital completo, texto extraivel (caminho feliz da IA)
//   escaneado   -> PDF e imagem (quase sem texto) -> precisaria de OCR
//   texto_curto -> texto real, mas so um resumo/aviso (sem edital completo)
function classificarTexto(chars, charsPorPagina) {
  if (charsPorPagina <= MAX_CHARS_ESCANEADO) return 'escaneado';
  if (chars >= MIN_CHARS_TOTAL && charsPorPagina >= MIN_CHARS_POR_PAGINA) return 'texto_ok';
  return 'texto_curto';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (parte, total) => (total === 0 ? '0%' : `${((parte / total) * 100).toFixed(1)}%`);

// ---------------------------------------------------------------------------
// 1. Amostra do banco real (via docker exec psql — sem dependencia `pg`)
// ---------------------------------------------------------------------------
async function lerAmostra() {
  const sql = `SELECT id_externo || E'\\t' || left(replace(objeto, E'\\n', ' '), 70)
               FROM editais WHERE is_obra = true
               ORDER BY data_publicacao DESC LIMIT ${AMOSTRA};`;
  const { stdout } = await execFileP('docker', [
    'exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-t', '-A', '-c', sql,
  ]);
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [idExterno, objeto] = l.split('\t');
      return { idExterno, objeto: objeto ?? '' };
    });
}

// numeroControlePNCP: "{cnpj}-1-{sequencial}/{ano}" -> partes p/ o endpoint.
function parseControle(numeroControlePNCP) {
  const m = /^(\d+)-\d+-(\d+)\/(\d+)$/.exec(numeroControlePNCP);
  if (!m) return null;
  return { cnpj: m[1], sequencial: String(Number(m[2])), ano: m[3] };
}

// ---------------------------------------------------------------------------
// 2. Listar os arquivos (documentos) de uma contratacao no PNCP
// ---------------------------------------------------------------------------
async function fetchComBackoff(url, opts = {}) {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...opts });
    if (resp.status === 429) {
      await sleep(BACKOFF_MS * tentativa);
      continue;
    }
    return resp;
  }
  throw new Error(`429 persistente em ${url}`);
}

async function listarArquivos({ cnpj, ano, sequencial }) {
  const url = `${PNCP_API}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`;
  const resp = await fetchComBackoff(url, { headers: { Accept: 'application/json' } });
  if (resp.status === 404 || resp.status === 204) return [];
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao listar arquivos`);
  const json = await resp.json();
  return Array.isArray(json) ? json : [];
}

// Escolhe o documento que mais parece o EDITAL principal.
function escolherEdital(arquivos) {
  const ativos = arquivos.filter((a) => a.statusAtivo !== false);
  const lista = ativos.length ? ativos : arquivos;
  const ehEdital = (a) =>
    /edital/i.test(a.tipoDocumentoNome ?? '') || /edital/i.test(a.titulo ?? '');
  return lista.find(ehEdital) ?? lista[0] ?? null;
}

// ---------------------------------------------------------------------------
// 3 + 4. Baixar, achar o PDF (solto ou dentro de ZIP) e extrair texto
// ---------------------------------------------------------------------------
const ehPdf = (buf) => buf.length >= 4 && buf.toString('latin1', 0, 4) === '%PDF';
const ehZip = (buf) => buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

function nomeDoContentDisposition(cd) {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd ?? '');
  return m ? decodeURIComponent(m[1]) : null;
}

async function contarPaginas(caminho) {
  try {
    const { stdout } = await execFileP('pdfinfo', [caminho]);
    const m = /Pages:\s+(\d+)/.exec(stdout);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

async function extrairTexto(caminho) {
  const { stdout } = await execFileP('pdftotext', ['-q', caminho, '-'], {
    maxBuffer: 128 * 1024 * 1024,
  });
  return stdout;
}

// Lista recursivamente os PDFs dentro de um diretorio.
async function listarPdfs(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listarPdfs(p)));
    else if (/\.pdf$/i.test(e.name)) out.push(p);
  }
  return out;
}

// Dentre varios PDFs (de um ZIP), escolhe o que mais parece o edital:
// prioriza nome com "edital"; senao o maior arquivo (anexos sao menores).
async function escolherPdfPrincipal(pdfs) {
  const edital = pdfs.find((p) => /edital/i.test(basename(p)));
  if (edital) return edital;
  const comTamanho = await Promise.all(
    pdfs.map(async (p) => ({ p, size: (await stat(p)).size })),
  );
  comTamanho.sort((a, b) => b.size - a.size);
  return comTamanho[0]?.p ?? null;
}

// Recebe o documento baixado e devolve o caminho de um PDF analisavel (ou null).
async function resolverPdf(buffer, dir, idx) {
  if (ehPdf(buffer)) {
    const caminho = join(dir, `${idx}.pdf`);
    await writeFile(caminho, buffer);
    return { caminho, embrulho: 'pdf' };
  }
  if (ehZip(buffer)) {
    const zipPath = join(dir, `${idx}.zip`);
    const destDir = join(dir, `${idx}-zip`);
    await writeFile(zipPath, buffer);
    try {
      await execFileP('unzip', ['-o', '-qq', zipPath, '-d', destDir]);
    } catch {
      return { caminho: null, embrulho: 'zip-corrompido' };
    }
    const pdfs = await listarPdfs(destDir);
    if (!pdfs.length) return { caminho: null, embrulho: 'zip-sem-pdf' };
    return { caminho: await escolherPdfPrincipal(pdfs), embrulho: 'zip' };
  }
  return { caminho: null, embrulho: 'outro' };
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------
async function main() {
  console.log('Spike T-47 — extrair texto do PDF do edital (PNCP)\n');
  const amostra = await lerAmostra();
  console.log(`Amostra: ${amostra.length} editais de obra (mais recentes) do banco de dev\n`);

  const dir = await mkdtemp(join(tmpdir(), 'spike-pncp-pdf-'));
  const resultados = [];

  for (const [i, edital] of amostra.entries()) {
    const prefixo = `[${String(i + 1).padStart(2, '0')}/${amostra.length}] ${edital.idExterno}`;
    const partes = parseControle(edital.idExterno);
    if (!partes) {
      console.log(`${prefixo}  ⚠ numeroControlePNCP fora do padrao — pulando`);
      resultados.push({ ...edital, categoria: 'erro', detalhe: 'controle invalido' });
      continue;
    }

    try {
      const arquivos = await listarArquivos(partes);
      if (!arquivos.length) {
        console.log(`${prefixo}  ⚪ sem documento publicado`);
        resultados.push({ ...edital, categoria: 'sem_documento' });
        await sleep(DELAY_MS);
        continue;
      }

      const doc = escolherEdital(arquivos);
      const tipo = doc.tipoDocumentoNome ?? '?';
      const resp = await fetchComBackoff(doc.url ?? doc.uri, { headers: { Accept: '*/*' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ao baixar`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      const nomeReal =
        nomeDoContentDisposition(resp.headers.get('content-disposition')) ?? doc.titulo ?? '';

      const { caminho, embrulho } = await resolverPdf(buffer, dir, i);
      if (!caminho) {
        const ext = (nomeReal.split('.').pop() ?? '?').slice(0, 12);
        console.log(`${prefixo}  ⚪ sem PDF util (${embrulho}, ${ext}) [${tipo}]`);
        resultados.push({ ...edital, categoria: 'nao_pdf', detalhe: embrulho, ext, tipo });
        await sleep(DELAY_MS);
        continue;
      }

      const paginas = await contarPaginas(caminho);
      const texto = await extrairTexto(caminho);
      const chars = texto.replace(/\s+/g, ' ').trim().length;
      const charsPorPagina = paginas ? Math.round(chars / paginas) : chars;

      const categoria = classificarTexto(chars, charsPorPagina);
      const icone = { texto_ok: '✅', texto_curto: '🟡', escaneado: '🔴' }[categoria];
      const tag = embrulho === 'zip' ? 'PDF-em-ZIP' : 'PDF';
      console.log(
        `${prefixo}  ${icone} ${tag} ${paginas ?? '?'}p, ${chars} chars (${charsPorPagina}/pag) [${tipo}]`,
      );
      resultados.push({
        ...edital, categoria, embrulho, paginas, chars, charsPorPagina, tipo,
        amostraTexto: texto.replace(/\s+/g, ' ').trim().slice(0, 180),
      });
    } catch (erro) {
      console.log(`${prefixo}  ✖ erro: ${erro.message}`);
      resultados.push({ ...edital, categoria: 'erro', detalhe: erro.message });
    }
    await sleep(DELAY_MS);
  }

  await rm(dir, { recursive: true, force: true });

  // -------------------------------------------------------------------------
  // Relatorio
  // -------------------------------------------------------------------------
  const total = resultados.length;
  const por = (cat) => resultados.filter((r) => r.categoria === cat);
  const textoOk = por('texto_ok');
  const textoCurto = por('texto_curto');
  const escaneado = por('escaneado');
  const naoPdf = por('nao_pdf');
  const semDoc = por('sem_documento');
  const erros = por('erro');

  console.log(`\n${'='.repeat(70)}\nRESULTADO (de ${total} editais)\n${'='.repeat(70)}`);
  console.log(`  ✅ edital completo, texto extraivel:   ${textoOk.length} (${pct(textoOk.length, total)})`);
  console.log(`  🟡 so resumo/aviso curto (texto real): ${textoCurto.length} (${pct(textoCurto.length, total)})`);
  console.log(`  🔴 escaneado/imagem (precisa OCR):     ${escaneado.length} (${pct(escaneado.length, total)})`);
  console.log(`  ⚪ sem PDF util (outro formato/zip):   ${naoPdf.length} (${pct(naoPdf.length, total)})`);
  console.log(`  ⚪ sem documento publicado:            ${semDoc.length} (${pct(semDoc.length, total)})`);
  console.log(`  ✖ erro (rede/HTTP/parse):             ${erros.length} (${pct(erros.length, total)})`);

  const comTexto = [...textoOk, ...textoCurto, ...escaneado];
  const emZip = comTexto.filter((r) => r.embrulho === 'zip').length;
  if (comTexto.length) {
    const chars = textoOk.map((r) => r.chars);
    const media = chars.length ? Math.round(chars.reduce((a, b) => a + b, 0) / chars.length) : 0;
    console.log(`\n  Dos ${comTexto.length} com PDF: ${emZip} vieram dentro de ZIP.`);
    console.log(`  Editais completos: media de ${media} chars de texto (cabem na IA com chunking).`);
  }
  if (naoPdf.length) {
    const tipos = {};
    naoPdf.forEach((r) => { tipos[r.detalhe] = (tipos[r.detalhe] ?? 0) + 1; });
    console.log(`  "Sem PDF util" por motivo: ${JSON.stringify(tipos)}`);
  }
  if (erros.length) {
    console.log(`  Erros: ${erros.map((r) => r.detalhe).slice(0, 5).join(' | ')}`);
  }

  if (textoOk.length) {
    console.log(`\n  Amostra de texto extraido (1o edital completo):`);
    console.log(`    "${textoOk[0].amostraTexto}..."`);
  }
  if (textoCurto.length) {
    console.log(`\n  So resumo/aviso (orgao nao publicou o edital completo aqui):`);
    textoCurto.slice(0, 8).forEach((r) =>
      console.log(`    - ${r.idExterno}: ${r.chars} chars / ${r.paginas ?? '?'}p`));
  }
  if (escaneado.length) {
    console.log(`\n  Escaneados (candidatos a OCR):`);
    escaneado.slice(0, 8).forEach((r) =>
      console.log(`    - ${r.idExterno}: ${r.chars} chars / ${r.paginas ?? '?'}p`));
  }

  console.log(`\n${'='.repeat(70)}\nVEREDITO\n${'='.repeat(70)}`);
  console.log(`  ${pct(textoOk.length, total)} tem edital completo com texto direto extraivel (caminho feliz).`);
  console.log(`  ${pct(textoCurto.length, total)} so tem resumo/aviso curto publicado (texto ok, mas sem edital).`);
  console.log(`  ${pct(escaneado.length, total)} sao escaneados (precisariam de OCR — task futura, hoje raro).`);
  console.log(`  ${pct(semDoc.length + naoPdf.length, total)} sem PDF util (sem doc ou outro formato).`);
  console.log(`  ${pct(erros.length, total)} falharam por rede/HTTP (re-tentaveis).`);
  console.log('  Insumo para T-48 (IA extrai exigencias) e T-49 (servico com cache).');
}

main().catch((e) => {
  console.error('Falha no spike:', e);
  process.exit(1);
});
