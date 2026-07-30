// T-209, 2ª rodada — as perguntas que a 1ª rodada ABRIU.
//
// A 1ª rodada derrubou duas premissas do épico, e cada uma pede uma pergunta nova:
//   1. Criar cliente SEM cpfCnpj foi ACEITO (200). Então a pergunta certa não é
//      "o Asaas exige documento para criar cliente" — é **em que momento** ele
//      passa a exigir: na COBRANÇA? Na assinatura? Na NFS-e?
//   2. Pix e boleto são recusados em checkout RECURRENT ("CREDIT_CARD é o único
//      método permitido"). Então Pix recorrente, se existir, mora no MESMO lugar
//      que o boleto: `POST /subscriptions`. Testar.
//
// Uso: node spikes/asaas-sandbox2.mjs

import { readFileSync } from 'node:fs';

function carregarEnv(caminho) {
  try {
    for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* sem .env */
  }
}
carregarEnv(new URL('../apps/api/.env', import.meta.url).pathname);

const BASE = process.env.ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com/v3';
const KEY = process.env.ASAAS_API_KEY;
if (!KEY) {
  console.error('ASAAS_API_KEY ausente em apps/api/.env');
  process.exit(1);
}

async function chamar(metodo, caminho, corpo) {
  const resp = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      access_token: KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'PrumoLicita-spike/T-209',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  let json = null;
  try {
    json = await resp.json();
  } catch {
    /* sem corpo */
  }
  return { status: resp.status, json };
}

const erros = (r) =>
  (r.json?.errors ?? [])
    .map((e) => `${e.code ?? '?'}: ${e.description ?? ''}`)
    .join(' | ');

const daquiADias = (d) =>
  new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

// ── 1) QUANDO o documento passa a ser exigido?
console.log('── 1) em que momento o Asaas exige CPF/CNPJ');
const semDoc = await chamar('POST', '/customers', {
  name: 'Spike T-209 rodada 2 — sem documento',
});
const idSemDoc = semDoc.json?.id;
console.log(
  `   cliente sem documento: ${semDoc.status} ${idSemDoc ?? erros(semDoc)}`,
);
console.log(`   cpfCnpj devolvido pela API: ${JSON.stringify(semDoc.json?.cpfCnpj)}`);

if (idSemDoc) {
  // A pergunta que importa: dá para COBRAR esse cliente?
  const cobr = await chamar('POST', '/payments', {
    customer: idSemDoc,
    billingType: 'BOLETO',
    value: 100,
    dueDate: daquiADias(7),
    description: 'Spike T-209 — cobrança de cliente sem documento',
  });
  console.log(
    cobr.json?.id
      ? `   ⚠️  COBRANÇA por boleto criada mesmo sem documento: ${cobr.json.id}`
      : `   ✓ cobrança recusada: ${cobr.status} — ${erros(cobr)}`,
  );

  const assin = await chamar('POST', '/subscriptions', {
    customer: idSemDoc,
    billingType: 'BOLETO',
    value: 100,
    nextDueDate: daquiADias(7),
    cycle: 'MONTHLY',
  });
  console.log(
    assin.json?.id
      ? `   ⚠️  ASSINATURA criada mesmo sem documento: ${assin.json.id}`
      : `   ✓ assinatura recusada: ${assin.status} — ${erros(assin)}`,
  );
}

// ── 2) Pix em assinatura DIRETA (o mesmo caminho do boleto)
console.log('\n── 2) Pix recorrente pela assinatura direta (não pelo checkout)');
const comDoc = await chamar('POST', '/customers', {
  name: 'Spike T-209 rodada 2 — com CNPJ',
  cpfCnpj: '11222333000181',
});
const cid = comDoc.json?.id;
console.log(`   cliente com CNPJ: ${cid ?? erros(comDoc)}`);

if (cid) {
  for (const tipo of ['PIX', 'UNDEFINED']) {
    const r = await chamar('POST', '/subscriptions', {
      customer: cid,
      billingType: tipo,
      value: 100,
      nextDueDate: daquiADias(7),
      cycle: 'MONTHLY',
      description: `Spike T-209 — assinatura ${tipo}`,
      externalReference: 'user-id-de-teste',
    });
    console.log(
      r.json?.id
        ? `   ✓ assinatura ${tipo}: criada (${r.json.id}, status ${r.json.status})`
        : `   ✗ assinatura ${tipo}: ${r.status} — ${erros(r)}`,
    );
  }
}

// ── 3) Webhook: quais campos o objeto aceita? Há segredo/HMAC?
console.log('\n── 3) criar webhook para inspecionar os campos de autenticação');
const wh = await chamar('POST', '/webhooks', {
  name: 'Spike T-209 (inspeção de campos)',
  url: 'https://api.prumolicita.com.br/webhooks/asaas-spike-t209',
  email: 'ps6711534@gmail.com',
  enabled: false, // desabilitado: não queremos entrega real para endpoint inexistente
  interrupted: false,
  authToken: 'token-de-teste-do-spike',
  sendType: 'SEQUENTIALLY',
  events: ['PAYMENT_RECEIVED'],
});
if (wh.json?.id) {
  console.log(`   ✓ criado: ${wh.json.id}`);
  console.log(`   campos do objeto: ${Object.keys(wh.json).join(', ')}`);
  console.log(
    '   → Procurar campo de SEGREDO/assinatura além de authToken. Se não houver,',
  );
  console.log(
    '     confirma-se a regressão da T-207: autenticação por token estático.',
  );
  // Limpa: o spike não deve deixar webhook pendurado na conta.
  const del = await chamar('DELETE', `/webhooks/${wh.json.id}`);
  console.log(`   limpeza: DELETE → ${del.status}`);
} else {
  console.log(`   ✗ ${wh.status} — ${erros(wh)}`);
}

// ── 4) Meios de pagamento aceitos numa assinatura (o que a doc não lista claro)
console.log('\n── 4) NFS-e: a conta de sandbox tem o serviço disponível?');
const nf = await chamar('GET', '/invoices?limit=1');
console.log(
  nf.status === 200
    ? `   ✓ endpoint de notas responde (total: ${nf.json?.totalCount ?? '?'})`
    : `   ✗ ${nf.status} — ${erros(nf)}`,
);
const munic = await chamar('GET', '/invoices/municipalSettings');
console.log(
  `   configuração municipal de NFS-e: ${munic.status} ${munic.status !== 200 ? erros(munic) : JSON.stringify(munic.json).slice(0, 160)}`,
);
