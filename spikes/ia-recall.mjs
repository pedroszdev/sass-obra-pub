// spikes/ia-recall.mjs
// Spike T-139 — mede o FALSO NEGATIVO (recall) da extração de exigências.
//
// A T-107 mediu PRECISÃO: partiu das afirmações da IA e conferiu se existiam no
// edital (0 alucinações em 202). Ela NÃO mede o erro que importa mais: a IA
// deixar passar uma exigência que existe. É esse que produz o "apto" indevido —
// o empreiteiro monta proposta e é inabilitado por um documento que o
// diagnóstico não viu (§3.4: "saída de IA errada é PIOR que ausência dela").
//
// Método (inverso do da T-107): para cada exigência que a IA marcou como NÃO
// exigida, procura no texto do edital os termos canônicos daquele requisito, com
// **limite de palavra**. Cada acerto vira um CANDIDATO a falso negativo, impresso
// com ±200 chars de contexto — porque presença de palavra NÃO é exigência de
// habilitação ("consorciada de maior capital social" não exige capital social).
// A decisão final é humana, lendo os trechos.
//
// ZERO chamadas de IA: só baixa o PDF (cacheado) e procura termos.
//
// Rode com:
//   pnpm --filter api build
//   node spikes/ia-revalidacao.mjs   # gera spikes/out-t107/*.json (custa IA)
//   node spikes/ia-recall.mjs        # grátis, lê aqueles JSONs

import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(AQUI, '..', 'apps', 'api');
const JSONS = join(AQUI, 'out-t107');
const CACHE = join(AQUI, 'out-t139-textos');

const requireApi = createRequire(join(API_DIR, 'package.json'));
requireApi('reflect-metadata');
const { DocumentoTextoService } = requireApi('./dist/editais/exigencias/documento-texto.service.js');
const { PncpConnector } = requireApi('./dist/editais/connectors/pncp/pncp.connector.js');
const { temSinalHabilitacao } = requireApi('./dist/editais/exigencias/exigencias-verificacao.js');

const norm = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

// Termos canônicos por exigência. **Limite de palavra é obrigatório**: sem `\b`,
// "crea" casa dentro de "recreativo" e fabrica falso negativo do nada.
const TERMOS = {
  CND_FEDERAL: [/\breceita federal\b/, /\bpgfn\b/, /divida ativa da uniao/, /fazendas? (publica )?federal/],
  FGTS: [/\bfgts\b/, /fundo de garantia do tempo/],
  TRABALHISTA: [/\bcndt\b/, /debitos trabalhistas/, /justica do trabalho/],
  ESTADUAL: [/fazendas? (publica )?estadual/, /tributos estaduais/],
  MUNICIPAL: [/fazendas? (publica )?municipal/, /tributos municipais/],
  FALENCIA: [/\bfalencia\b/, /\bconcordata\b/, /recuperacao judicial/],
  REGISTRO_CONSELHO: [/\bcrea\b/, /\bcau\b/, /conselho regional de engenharia/],
  CAPACIDADE_TECNICA: [/atestado de capacidade/, /acervo tecnico/, /capacidade tecnic/],
  // `patrimonio liquido` está aqui de propósito: a Lei 14.133 (art. 69) permite
  // exigir capital social OU PL mínimo, e o edital costuma usar PL. Foi assim que
  // esta medição achou os 2 falsos negativos reais.
  CAPITAL_SOCIAL: [/\bcapital social\b/, /patrimonio liquido/],
};

async function textoDoEdital(idExterno, docs, conn) {
  const slug = idExterno.replace(/\//g, '_');
  const cache = join(CACHE, `${slug}.txt`);
  try {
    return await readFile(cache, 'utf8');
  } catch {
    /* não cacheado — baixa */
  }
  for (const c of await conn.fetchEditalDocuments(idExterno)) {
    let t = null;
    try {
      t = await docs.extrairDeUrl(c.url);
    } catch {
      continue;
    }
    if (t && temSinalHabilitacao(t)) {
      await writeFile(cache, t);
      return t;
    }
  }
  return null;
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  const docs = new DocumentoTextoService();
  const conn = new PncpConnector();

  const arquivos = (await readdir(JSONS)).filter((f) => f.endsWith('.json'));
  if (arquivos.length === 0) throw new Error('Rode antes o spikes/ia-revalidacao.mjs');

  const stats = {};
  const suspeitos = [];

  for (const f of arquivos) {
    const d = JSON.parse(await readFile(join(JSONS, f), 'utf8'));
    const texto = await textoDoEdital(d.idExterno, docs, conn);
    if (!texto) {
      console.log(`✖ sem texto: ${d.idExterno}`);
      continue;
    }
    const t = norm(texto);
    const e = d.exigencias;

    // A IA afirmou este tipo? (certidão duplicada conta uma vez — T-116c)
    const afirmou = {};
    for (const c of e.certidoes ?? []) afirmou[c.tipo] = afirmou[c.tipo] || c.exigida;
    afirmou.REGISTRO_CONSELHO = e.registroConselho?.exigido;
    afirmou.CAPACIDADE_TECNICA = e.capacidadeTecnica?.exigida;
    afirmou.CAPITAL_SOCIAL = e.capitalSocial?.exigido;

    for (const [tipo, regexes] of Object.entries(TERMOS)) {
      const s = (stats[tipo] ??= { afirmou: 0, negouComTermo: 0, negouSemTermo: 0 });
      if (afirmou[tipo]) {
        s.afirmou++;
        continue;
      }
      const m = regexes.map((rx) => rx.exec(t)).find(Boolean);
      if (!m) {
        s.negouSemTermo++;
        continue;
      }
      s.negouComTermo++;
      const i = m.index;
      suspeitos.push({
        id: d.idExterno,
        tipo,
        termo: m[0],
        ctx: t.slice(Math.max(0, i - 200), i + 200),
      });
    }
  }

  console.log('\ntipo                | IA afirmou | negou C/ termo | negou S/ termo');
  console.log('-'.repeat(70));
  for (const [k, v] of Object.entries(stats)) {
    console.log(
      `${k.padEnd(19)} | ${String(v.afirmou).padStart(10)} | ${String(v.negouComTermo).padStart(14)} | ${String(v.negouSemTermo).padStart(14)}`,
    );
  }

  console.log(`\n=== ${suspeitos.length} CANDIDATOS A FALSO NEGATIVO (revisão humana) ===`);
  console.log('Presença do termo NÃO é exigência de habilitação — leia o contexto.\n');
  for (const s of suspeitos) {
    console.log(`[${s.tipo}] ${s.id}  (termo: "${s.termo}")`);
    console.log(`   …${s.ctx}…\n`);
  }
}

main().catch((e) => {
  console.error('Falha no spike:', e);
  process.exit(1);
});
