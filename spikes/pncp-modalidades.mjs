// spikes/pncp-modalidades.mjs
// Spike T-113 — medir a LACUNA de cobertura de obra fora da Concorrência.
//   Hoje a captação só pega modalidade 4/5 (Concorrência). Serviços comuns de
//   engenharia (manutenção, reforma, recapeamento, calçamento, drenagem) vão por
//   PREGÃO (6/7) e obras/serviços até ~R$120k por DISPENSA eletrônica (8).
//   Este spike roda as MESMAS keywords de inclusão do catálogo de produção sobre
//   pregão/dispensa (SC, 30 dias), conta quantos "parecem obra", mede o ruído
//   (keywords ambíguas que pegam TI) e a faixa de valor — para decidir, com o
//   dado na mão, se vale expandir a captação.
//
// Espelho do T-02 (spikes/pncp.mjs). Rode com:
//   node spikes/pncp-modalidades.mjs      (Node 20+, fetch nativo, zero deps)
// NÃO é código de produto — é um spike descartável de medição.

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------
const UF = 'SC';
const DIAS = 30;
// 4/5 = baseline (o que JÁ captamos). 6/7/8 = a lacuna a medir.
const MODALIDADES = [
  { id: 4, nome: 'Concorrência - Eletrônica', baseline: true },
  { id: 5, nome: 'Concorrência - Presencial', baseline: true },
  { id: 6, nome: 'Pregão - Eletrônico', baseline: false },
  { id: 7, nome: 'Pregão - Presencial', baseline: false },
  { id: 8, nome: 'Dispensa', baseline: false },
];
const TAMANHO_PAGINA = 50;
const DELAY_MS = 700;
const TIMEOUT_MS = 20000;
const MAX_TENTATIVAS = 5;
const BACKOFF_MS = 3000;
const ME_EPP_LIMITE = 80000; // LC 123/2006 art. 48 — o preset "Até R$ 80 mil"

const BASE_URL = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';

// Palavras do catálogo de PRODUÇÃO (apps/api/.../obra/obra-catalog.ts). Mantidas
// idênticas de propósito: o spike mede o que o classificador de hoje faria.
const INCLUSAO = [
  'obra', 'construc', 'reforma', 'pavimenta', 'recapea', 'edifica', 'engenharia',
  'drenagem', 'dragagem', 'saneamento', 'urbaniza', 'revitaliza', 'ampliacao',
  'calcament', 'ponte', 'passarela', 'muro de contencao', 'quadra', 'reservatorio',
  'galeria', 'terraplanagem', 'infraestrutura', 'implantacao', 'esgoto',
  'iluminacao publica', 'ciclovia',
];
const EXCLUSAO = [
  'locacao', 'aluguel', 'limpeza', 'coleta de residuos', 'coleta de lixo',
  'vigilancia', 'seguranca patrimonial', 'software', 'licenca de uso',
  'consultoria', 'capacitacao', 'treinamento',
];
// Keywords que sozinhas pegam TI/outros (ruído esperado — nota da T-113).
const AMBIGUAS = ['infraestrutura', 'implantacao'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatarData(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}${mes}${dia}`;
}

function semAcento(texto) {
  return (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const bate = (texto, lista) => {
  const t = semAcento(texto);
  return lista.filter((p) => t.includes(p));
};

function periodo() {
  const hoje = new Date();
  const inicio = new Date();
  inicio.setDate(hoje.getDate() - DIAS);
  return { dataInicial: formatarData(inicio), dataFinal: formatarData(hoje) };
}

const pct = (parte, total) => (total === 0 ? '0%' : `${((parte / total) * 100).toFixed(1)}%`);

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
      console.log(`    ⏳ 429 na página ${pagina}; aguardando ${espera}ms (${tentativa}/${MAX_TENTATIVAS})`);
      await sleep(espera);
      continue;
    }
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}\n${texto.slice(0, 200)}`);
    return JSON.parse(texto);
  }
  throw new Error(`Rate limit persistente na página ${pagina}`);
}

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
      console.error(`    ✖ modalidade ${modalidade} parou na página ${p}/${totalPaginas}: ${erro.message}`);
      return { registros, totalRegistros: primeira.totalRegistros ?? registros.length, parcial: true };
    }
  }
  return { registros, totalRegistros: primeira.totalRegistros ?? registros.length, parcial: false };
}

function faixaValor(v) {
  if (v == null || v <= 0) return 'sem valor';
  if (v <= ME_EPP_LIMITE) return '≤ R$ 80 mil';
  if (v <= 1500000) return 'R$ 80 mil–1,5 mi';
  return '> R$ 1,5 mi';
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
async function main() {
  const datas = periodo();
  console.log('T-113 — Lacuna de cobertura de obra fora da Concorrência');
  console.log(`  UF: ${UF} | período: ${datas.dataInicial}–${datas.dataFinal} (${DIAS} dias)\n`);

  const resumo = [];

  for (const mod of MODALIDADES) {
    let dados;
    try {
      dados = await buscarTodos(mod.id, datas);
    } catch (erro) {
      console.error(`  ✖ modalidade ${mod.id} (${mod.nome}) falhou: ${erro.message}\n`);
      continue;
    }
    const { registros, totalRegistros, parcial } = dados;
    const total = registros.length;

    // Candidatos a obra = casam palavra de INCLUSÃO (o que o classificador de
    // produção marcaria como obra fora da modalidade de obra).
    const candidatos = registros.filter((r) => bate(r.objetoCompra, INCLUSAO).length > 0);
    // Ruído: casaram SÓ por keyword ambígua (infraestrutura/implantacao) e por
    // mais nada — forte suspeita de TI/outros, não obra de engenharia.
    const soAmbiguas = candidatos.filter((r) => {
      const hits = bate(r.objetoCompra, INCLUSAO);
      return hits.length > 0 && hits.every((h) => AMBIGUAS.includes(h));
    });
    // Candidatos que também batem exclusão (borderline — locação/limpeza etc.).
    const comExclusao = candidatos.filter((r) => bate(r.objetoCompra, EXCLUSAO).length > 0);

    // Faixa de valor dos candidatos (importa para o preset "Até R$ 80 mil").
    const faixas = {};
    for (const r of candidatos) {
      const f = faixaValor(r.valorTotalEstimado);
      faixas[f] = (faixas[f] ?? 0) + 1;
    }

    console.log(`${'='.repeat(70)}`);
    console.log(`Modalidade ${mod.id} — ${mod.nome}${mod.baseline ? '  [baseline: já captada]' : '  [LACUNA]'}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`  Total no período:            ${total}/${totalRegistros}${parcial ? ' (PARCIAL)' : ''}  (~${(total / DIAS).toFixed(1)}/dia)`);
    console.log(`  "Parecem obra" (inclusão):   ${candidatos.length} (${pct(candidatos.length, total)})  (~${(candidatos.length / DIAS).toFixed(1)}/dia)`);
    console.log(`    - só por keyword ambígua:  ${soAmbiguas.length}  (ruído provável: TI/outros)`);
    console.log(`    - também batem exclusão:   ${comExclusao.length}  (borderline)`);
    console.log(`  Faixa de valor dos candidatos:`);
    for (const f of ['sem valor', '≤ R$ 80 mil', 'R$ 80 mil–1,5 mi', '> R$ 1,5 mi']) {
      if (faixas[f]) console.log(`      ${f.padEnd(18)} ${faixas[f]}`);
    }
    console.log(`  Amostra de candidatos (até 15):`);
    candidatos.slice(0, 15).forEach((r) => {
      const hits = bate(r.objetoCompra, INCLUSAO).join(',');
      const val = r.valorTotalEstimado != null ? `R$ ${r.valorTotalEstimado.toLocaleString('pt-BR')}` : 'sem valor';
      console.log(`      [${hits}] ${r.unidadeOrgao?.municipioNome ?? '?'} — ${val}`);
      console.log(`         ${(r.objetoCompra ?? '(sem objeto)').slice(0, 110)}`);
    });
    console.log('');

    resumo.push({
      id: mod.id,
      nome: mod.nome,
      baseline: mod.baseline,
      total,
      candidatos: candidatos.length,
      soAmbiguas: soAmbiguas.length,
      comExclusao: comExclusao.length,
      ate80k: faixas['≤ R$ 80 mil'] ?? 0,
      parcial,
    });
    await sleep(DELAY_MS);
  }

  // Resumo final — insumo direto para a recomendação do "Pronto quando".
  console.log(`${'='.repeat(70)}`);
  console.log('RESUMO (candidatos a obra por modalidade, SC, 30 dias)');
  console.log(`${'='.repeat(70)}`);
  console.log('  mod  modalidade                total  cand.  ~/dia  só-ambíg  ≤80k');
  for (const r of resumo) {
    console.log(
      `  ${String(r.id).padEnd(4)} ${r.nome.padEnd(24)} ${String(r.total).padStart(5)}  ${String(r.candidatos).padStart(5)}  ${(r.candidatos / DIAS).toFixed(1).padStart(5)}  ${String(r.soAmbiguas).padStart(7)}  ${String(r.ate80k).padStart(5)}${r.parcial ? '  (PARCIAL)' : ''}`,
    );
  }
  const lacuna = resumo.filter((r) => !r.baseline).reduce((s, r) => s + r.candidatos, 0);
  const lacunaLimpa = resumo
    .filter((r) => !r.baseline)
    .reduce((s, r) => s + (r.candidatos - r.soAmbiguas), 0);
  console.log('');
  console.log(`  Lacuna bruta (6/7/8): ${lacuna} candidatos/mês (~${(lacuna / DIAS).toFixed(1)}/dia).`);
  console.log(`  Lacuna descontando ruído ambíguo: ~${lacunaLimpa} candidatos/mês.`);
  console.log('');
  console.log('  → Para a recomendação: comparar a lacuna limpa com o baseline (4/5),');
  console.log('    olhar a amostra para estimar a taxa de ruído real, e checar quanto da');
  console.log('    lacuna cai em "≤ R$ 80 mil" (o preset que hoje vem estruturalmente vazio).');
}

main();
