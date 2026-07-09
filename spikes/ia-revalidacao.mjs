// spikes/ia-revalidacao.mjs
// Spike T-107 — Revalidar o acerto da IA em amostra maior, NO PROVIDER/MODELO
//   QUE ESTÁ EM PRODUÇÃO (CLAUDE.md §3.4). A T-48 mediu n=5 e o RESULTADOS.md
//   pediu amostra maior. Aqui: n=25, cobrindo as três saídas de IA do produto —
//   exigências (T-49), resumo (T-50) e itens da planilha (T-64).
//
// DIFERENÇA CRÍTICA para o edital-ia.mjs (T-48): aquele spike tinha prompt e
// schema PRÓPRIOS (snake_case). Medir com eles não valida o que roda em prod.
// Este importa os SERVIÇOS REAIS do `apps/api/dist` — mesmo modelo, mesmo
// prompt, mesmo JSON Schema, mesma seleção de documento, mesmo cálculo de custo.
// Se a produção mudar, esta medição muda junto (é o ponto).
//
// Rode com:
//   pnpm --filter api build          # o spike lê o dist
//   node spikes/ia-revalidacao.mjs
//
//   ALVO=25            quantos editais analisar
//   CANDIDATOS=80      quantos buscar no banco p/ achar ALVO com texto útil
//   SEM_ITENS=1        pula a extração de itens (mede só exigências+resumo)
//   DOCKER_CONTEXT=default   (o container do projeto vive no contexto default)
//
// `store` NÃO é ligado (decisão do dono): as completions não ficam retidas na
// OpenAI. Os JSONs de cada edital são gravados em spikes/out-t107/ para revisão.

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const AQUI = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(AQUI, '..', 'apps', 'api');
const OUT_DIR = join(AQUI, 'out-t107');

const ALVO = Number(process.env.ALVO ?? 25);
const CANDIDATOS = Number(process.env.CANDIDATOS ?? 80);
const SEM_ITENS = process.env.SEM_ITENS === '1';
const PG_CONTAINER = process.env.PG_CONTAINER ?? 'obrapub-postgres';
const PG_USER = process.env.DATABASE_USER ?? 'obrapub';
const PG_DB = process.env.DATABASE_NAME ?? 'obrapub';
// O container do projeto roda no contexto `default`; o CLI pode apontar pro
// Docker Desktop, onde existe um container homônimo e obsoleto.
const DOCKER_CTX = process.env.DOCKER_CONTEXT ?? 'default';

// ---------------------------------------------------------------------------
// Carrega o código de produção (CommonJS) a partir do dist da API.
// ---------------------------------------------------------------------------
const requireApi = createRequire(join(API_DIR, 'package.json'));
requireApi('reflect-metadata'); // os @Injectable() precisam dela no import

const { IaExtracaoService } = requireApi('./dist/editais/exigencias/ia-extracao.service.js');
const { DocumentoTextoService } = requireApi('./dist/editais/exigencias/documento-texto.service.js');
const { PlanilhaTextoService } = requireApi('./dist/editais/itens/planilha-texto.service.js');
const { PncpConnector } = requireApi('./dist/editais/connectors/pncp/pncp.connector.js');
const { scorePlanilhaNome, rankFormato } = requireApi('./dist/editais/itens/planilha-select.js');
const { verificarTrechos, temSinalHabilitacao, normalizaTexto } = requireApi(
  './dist/editais/exigencias/exigencias-verificacao.js',
);

// ConfigService de mentira: o serviço só chama .get(chave).
function fakeConfig(env) {
  return { get: (chave, fallback) => env[chave] ?? fallback };
}

async function carregarEnvDaApi() {
  const env = {};
  for (const arquivo of [join(API_DIR, '.env'), join(AQUI, '.env')]) {
    try {
      const txt = await readFile(arquivo, 'utf8');
      for (const linha of txt.split('\n')) {
        if (linha.trim().startsWith('#')) continue;
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch {
      /* arquivo ausente — segue com o que houver */
    }
  }
  return env;
}

// ---------------------------------------------------------------------------
// Amostra: editais de obra, abertos, mais recentes primeiro.
// ---------------------------------------------------------------------------
async function lerCandidatos() {
  const sql = `SELECT id_externo || E'\\t' || uf || E'\\t' || left(replace(objeto, E'\\n', ' '), 100)
               FROM editais
               WHERE is_obra = true AND fonte = 'PNCP'
               ORDER BY data_publicacao DESC LIMIT ${CANDIDATOS};`;
  const { stdout } = await execFileP('docker', [
    '--context', DOCKER_CTX, 'exec', PG_CONTAINER,
    'psql', '-U', PG_USER, '-d', PG_DB, '-t', '-A', '-c', sql,
  ]);
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [idExterno, uf, objeto] = l.split('\t');
      return { idExterno, uf, objeto: objeto ?? '' };
    });
}

// ---------------------------------------------------------------------------
// Aferições (além do trecho literal, que a produção já sabe medir)
// ---------------------------------------------------------------------------

// Termos que provam que o requisito EXISTE no edital, independentemente de a IA
// ter copiado ou parafraseado a citação. É o detector de alucinação de verdade:
// a T-48 mostrou que "trecho não bate literalmente" quase sempre é paráfrase, e
// não invenção — mas só dá pra afirmar isso checando o requisito, não o trecho.
// ⚠ A 1ª versão desta lista era estreita demais e acusou 7 "alucinações" que a
// inspeção desmentiu (os trechos citados existiam LITERALMENTE no edital):
//   - `garantia` só cobria "garantia da proposta/participação"; os editais dizem
//     "garantia de execução", "seguro garantia", "garantia contratual";
//   - `cnd_federal` exigia "receita federal"/"pgfn", mas é comuníssimo o edital
//     dizer só "Fazendas Federal, Estadual e Municipal".
// Lição registrada: num detector de alucinação, um termo faltando vira acusação
// falsa contra a IA. Errar para o lado de aceitar é o certo aqui — o alvo é
// pegar invenção grosseira, não auditar redação.
const TERMOS_REQUISITO = {
  cnd_federal: ['receita federal', 'pgfn', 'tributos federais', 'divida ativa da uniao', 'certidao negativa de debitos relativos', 'fazenda federal', 'fazendas federal', 'federal'],
  fgts: ['fgts', 'crf', 'fundo de garantia'],
  trabalhista: ['cndt', 'debitos trabalhistas', 'justica do trabalho'],
  estadual: ['fazenda estadual', 'sefaz', 'tributos estaduais', 'estadual'],
  municipal: ['fazenda municipal', 'tributos municipais', 'municipal'],
  falencia: ['falencia', 'concordata', 'recuperacao judicial', 'distribuidor'],
  registro_conselho: ['crea', 'cau', 'conselho regional de engenharia'],
  capacidade_tecnica: ['atestado', 'acervo tecnico', 'cat ', 'capacidade tecnica'],
  capital_social: ['capital social', 'patrimonio liquido'],
  garantia: ['garantia da proposta', 'garantia de participacao', 'caucao', 'garantia de execucao', 'seguro garantia', 'garantia contratual', 'prestacao de garantia', 'garantia adicional', 'garantia'],
};

// Cada afirmação "exigido: true" da IA tem lastro no texto?
//
// `tipo` vem do enum de produção em MAIÚSCULAS (CND_FEDERAL, FGTS…) — daí o
// toLowerCase. Sem isso o lookup falha e TUDO vira "sem lastro" (falso positivo
// que o smoke test pegou). `OUTRA` é aberta por definição (não há termo
// canônico): não dá para verificá-la por keyword, então é contada à parte em vez
// de acusar uma alucinação que não sabemos medir.
function conferirLastro(extracao, textoNorm) {
  const checagens = [];
  const naoVerificaveis = [];
  const push = (chave, exigido) => {
    if (!exigido) return; // só verificamos o que a IA AFIRMA
    const nome = String(chave).toLowerCase();
    const termos = TERMOS_REQUISITO[nome];
    if (!termos) {
      naoVerificaveis.push(nome);
      return;
    }
    checagens.push({ chave: nome, lastro: termos.some((t) => textoNorm.includes(t)) });
  };
  for (const c of extracao.certidoes ?? []) push(c.tipo, c.exigida);
  push('registro_conselho', extracao.registroConselho?.exigido);
  push('capacidade_tecnica', extracao.capacidadeTecnica?.exigida);
  push('capital_social', extracao.capitalSocial?.exigido);
  push('garantia', extracao.garantia?.exigida);
  return { checagens, naoVerificaveis };
}

// Sanidade dos itens da planilha (T-64): o caminho do dinheiro não pode ter
// quantidade zero/negativa, unidade vazia ou descrição vazia.
//
// A checagem `descricao === unidade` nasceu de um achado desta medição: em
// planilhas com colunas desalinhadas a IA copia a unidade para a descrição
// ("UNID.", "M2"), gerando linha-lixo que passaria em todas as outras guardas.
function conferirItens(itens) {
  const problemas = [];
  itens.forEach((it, i) => {
    const desc = (it.descricao ?? '').trim();
    const un = (it.unidade ?? '').trim();
    if (!desc) problemas.push(`item ${i}: descrição vazia`);
    if (!un) problemas.push(`item ${i}: unidade vazia`);
    if (desc && un && desc.toUpperCase() === un.toUpperCase())
      problemas.push(`item ${i}: descrição == unidade ("${desc}") — linha-lixo`);
    if (it.quantidade == null || it.quantidade <= 0)
      problemas.push(`item ${i}: quantidade inválida (${it.quantidade})`);
    if (it.precoUnitario != null && it.precoUnitario < 0)
      problemas.push(`item ${i}: preço negativo`);
  });
  return problemas;
}

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(0)}%`);

// ---------------------------------------------------------------------------
async function main() {
  const env = await carregarEnvDaApi();
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente (apps/api/.env ou spikes/.env)');

  const config = fakeConfig(env);
  const ia = new IaExtracaoService(config);
  const documentos = new DocumentoTextoService();
  const planilhas = new PlanilhaTextoService();
  const connector = new PncpConnector();

  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Spike T-107 — revalidação da IA no modelo de PRODUÇÃO: ${ia.modelo}`);
  console.log(`Alvo: ${ALVO} editais · itens: ${SEM_ITENS ? 'pulado' : 'incluído'} · store: false\n`);

  const candidatos = await lerCandidatos();
  console.log(`${candidatos.length} candidatos no banco.\n`);

  const linhas = [];
  let custoTotal = 0;

  for (const ed of candidatos) {
    if (linhas.length >= ALVO) break;
    process.stdout.write(`[${linhas.length + 1}/${ALVO}] ${ed.idExterno} (${ed.uf}) … `);

    // --- seleção de documento: exatamente como ExigenciasService.run() ---
    let docs;
    try {
      docs = await connector.fetchEditalDocuments(ed.idExterno);
    } catch (e) {
      console.log(`✖ listar documentos: ${e.message}`);
      continue;
    }

    let texto = null;
    let docNome = null;
    for (const cand of docs) {
      let extraido = null;
      try {
        extraido = await documentos.extrairDeUrl(cand.url);
      } catch {
        continue;
      }
      if (extraido && temSinalHabilitacao(extraido)) {
        texto = extraido;
        docNome = cand.nome;
        break;
      }
    }
    if (!texto) {
      console.log('⚪ indisponível (sem edital completo) — produção NÃO gastaria IA');
      continue;
    }

    // --- chamada 1: exigências + resumo (uma só, como em produção) ---
    let ext;
    try {
      ext = await ia.extrair(texto);
    } catch (e) {
      console.log(`✖ IA: ${e.message}`);
      continue;
    }
    custoTotal += ext.custoUsd;

    const r = ext.resultado;
    const textoNorm = normalizaTexto(texto);
    const trechos = verificarTrechos(r, texto);
    const { checagens: lastro, naoVerificaveis } = conferirLastro(r, textoNorm);
    const semLastro = lastro.filter((c) => !c.lastro);

    // Resumo (T-50): o schema de produção traz `visaoGeral`, não `objeto`.
    const resumoOk = Boolean(r.resumo?.visaoGeral?.trim());
    const datasChave = r.resumo?.datasChave?.length ?? 0;

    // --- chamada 2 (opcional): itens da planilha ---
    let itensInfo = null;
    if (!SEM_ITENS) {
      const pontuados = docs
        .map((c) => ({ ...c, score: scorePlanilhaNome(c.nome) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const extraidos = [];
      for (const cand of pontuados) {
        try {
          const p = await planilhas.extrairDeUrl(cand.url);
          if (p.texto) extraidos.push({ nome: cand.nome, score: cand.score, ...p });
        } catch {
          /* planilha ilegível (.xls binário etc.) — produção também pula */
        }
      }
      extraidos.sort((a, b) => b.score - a.score || rankFormato(b.formato) - rankFormato(a.formato));

      if (extraidos.length > 0) {
        try {
          const ei = await ia.extrairItens(extraidos[0].texto);
          custoTotal += ei.custoUsd;
          const itens = ei.resultado.itens ?? [];
          itensInfo = {
            planilha: extraidos[0].nome,
            temPlanilha: ei.resultado.temPlanilha,
            qtdItens: itens.length,
            problemas: conferirItens(itens),
            custoUsd: ei.custoUsd,
          };
        } catch (e) {
          itensInfo = { erro: e.message };
        }
      }
    }

    const linha = {
      idExterno: ed.idExterno,
      uf: ed.uf,
      objeto: ed.objeto,
      documento: docNome,
      charsTexto: texto.length,
      trechosOk: trechos.ok,
      trechosTotal: trechos.total,
      afirmacoes: lastro.length,
      afirmacoesSemLastro: semLastro.map((c) => c.chave),
      naoVerificaveis,
      resumoOk,
      datasChave,
      itens: itensInfo,
      custoUsd: ext.custoUsd + (itensInfo?.custoUsd ?? 0),
    };
    linhas.push(linha);

    await writeFile(
      join(OUT_DIR, `${ed.idExterno.replace(/[/]/g, '_')}.json`),
      JSON.stringify({ ...linha, exigencias: r, textoChars: texto.length }, null, 2),
    );

    const alerta = semLastro.length ? ` ⚠ SEM LASTRO: ${semLastro.map((c) => c.chave).join(',')}` : '';
    console.log(
      `✓ trechos ${trechos.ok}/${trechos.total} · afirmações ${lastro.length}` +
        `${alerta} · itens ${itensInfo?.qtdItens ?? '—'} · $${linha.custoUsd.toFixed(3)}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(72));
  console.log(`RESUMO — ${linhas.length} editais analisados, modelo ${ia.modelo}`);
  console.log('='.repeat(72));

  const trechosOk = linhas.reduce((s, l) => s + l.trechosOk, 0);
  const trechosTot = linhas.reduce((s, l) => s + l.trechosTotal, 0);
  const afirm = linhas.reduce((s, l) => s + l.afirmacoes, 0);
  const semLastroTot = linhas.reduce((s, l) => s + l.afirmacoesSemLastro.length, 0);
  const naoVerifTot = linhas.reduce((s, l) => s + l.naoVerificaveis.length, 0);
  const comResumo = linhas.filter((l) => l.resumoOk).length;
  const comDatas = linhas.filter((l) => l.datasChave > 0).length;
  const comItens = linhas.filter((l) => l.itens?.qtdItens > 0);
  const itensProblema = comItens.reduce((s, l) => s + l.itens.problemas.length, 0);
  const itensTot = comItens.reduce((s, l) => s + l.itens.qtdItens, 0);

  console.log(`\nEXIGÊNCIAS (T-49)`);
  console.log(`  Afirmações "exigido: true" verificáveis: ${afirm}`);
  console.log(`  SEM lastro no texto (alucinação): ${semLastroTot} (${pct(semLastroTot, afirm)})`);
  console.log(`  Trecho citado literalmente: ${trechosOk}/${trechosTot} (${pct(trechosOk, trechosTot)})`);
  console.log(`  → o 2º número mede FIDELIDADE DA CITAÇÃO, não acerto (T-48).`);
  console.log(`  Afirmações tipo OUTRA (não verificáveis por keyword): ${naoVerifTot}`);

  console.log(`\nRESUMO (T-50)`);
  console.log(`  Com visão geral preenchida: ${comResumo}/${linhas.length}`);
  console.log(`  Com ao menos uma data-chave: ${comDatas}/${linhas.length}`);

  if (!SEM_ITENS) {
    console.log(`\nITENS (T-64)`);
    console.log(`  Editais com planilha extraída: ${comItens.length}/${linhas.length}`);
    console.log(`  Itens extraídos: ${itensTot} · com problema de sanidade: ${itensProblema}`);
  }

  console.log(`\nCUSTO`);
  console.log(`  Total: $${custoTotal.toFixed(3)} · média $${(custoTotal / (linhas.length || 1)).toFixed(3)}/edital`);

  const suspeitos = linhas.filter((l) => l.afirmacoesSemLastro.length > 0);
  console.log(`\nPARA REVISÃO HUMANA (§3.4): ${suspeitos.length} edital(is) com afirmação sem lastro`);
  suspeitos.forEach((l) => console.log(`  - ${l.idExterno}: ${l.afirmacoesSemLastro.join(', ')}`));
  console.log(`\nJSONs por edital em: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('Falha no spike:', e);
  process.exit(1);
});
