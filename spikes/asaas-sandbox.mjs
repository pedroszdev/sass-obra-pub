// T-209 — fumaça do sandbox do Asaas + as dúvidas que a T-207 deixou abertas.
//
// Uso:  node spikes/asaas-sandbox.mjs
// Lê ASAAS_BASE_URL e ASAAS_API_KEY de apps/api/.env (ou do ambiente).
//
// ⚠️ NUNCA imprime a chave. Só diz se ela está presente e os 4 últimos dígitos,
// o suficiente para conferir "é a que eu colei?" sem vazar o segredo no terminal
// nem em log de sessão.
//
// O que responde (as três 🔬 registradas em RESULTADOS.md, seção T-207):
//   1. Pix vale para assinatura RECORRENTE, ou só para cobrança avulsa?
//   2. `endDate` é obrigatório no objeto subscription? (SaaS não tem fim)
//   3. O webhook oferece HMAC/assinatura, ou só o token estático no header?

import { readFileSync } from 'node:fs';

// .env sem dependência (o projeto não usa dotenv nos spikes).
function carregarEnv(caminho) {
  try {
    for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* sem .env: usa o ambiente */
  }
}
carregarEnv(new URL('../apps/api/.env', import.meta.url).pathname);

const BASE = process.env.ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com/v3';
const KEY = process.env.ASAAS_API_KEY;

if (!KEY) {
  console.error(
    'ASAAS_API_KEY ausente. Coloque-a em apps/api/.env (que é gitignored).\n' +
      'NÃO passe a chave por argumento de linha de comando: ela fica no histórico do shell.',
  );
  process.exit(1);
}

console.log(`Base URL : ${BASE}`);
console.log(`API key  : presente, terminada em …${KEY.slice(-4)}`);
console.log(
  `Ambiente : ${BASE.includes('sandbox') ? 'SANDBOX ✓' : '⚠️  PRODUÇÃO — confira se é isso mesmo'}\n`,
);

async function chamar(metodo, caminho, corpo) {
  const resp = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      access_token: KEY,
      'Content-Type': 'application/json',
      // O Asaas pede User-Agent identificável para suporte/rastreio.
      'User-Agent': 'PrumoLicita-spike/T-209',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  let json = null;
  try {
    json = await resp.json();
  } catch {
    /* resposta sem corpo JSON */
  }
  return { status: resp.status, json };
}

function erros(r) {
  return (r.json?.errors ?? [])
    .map((e) => `${e.code ?? '?'}: ${e.description ?? ''}`)
    .join(' | ');
}

const CNPJ_TESTE = '11222333000181'; // mesmo das fixtures (DV válido)

// ── 0) A chave funciona? Leitura simples, sem criar nada.
console.log('── 0) autenticação (GET /customers?limit=1)');
const auth = await chamar('GET', '/customers?limit=1');
console.log(
  auth.status === 200
    ? `   ✓ ${auth.status} — a chave é válida neste host. Clientes já cadastrados: ${auth.json?.totalCount ?? '?'}`
    : `   ✗ ${auth.status} — ${erros(auth) || 'sem detalhe'}`,
);
if (auth.status !== 200) {
  console.error(
    '\nParou aqui: sem autenticação o resto não diz nada.\n' +
      'Causa mais comum: chave de produção com URL de sandbox (ou o inverso).',
  );
  process.exit(1);
}

// ── 1) Cliente exige CPF/CNPJ? (a premissa que motivou a T-225)
console.log('\n── 1) criar cliente SEM cpfCnpj (deve falhar — premissa da T-225)');
const semDoc = await chamar('POST', '/customers', {
  name: 'Spike T-209 sem documento',
});
console.log(
  semDoc.status >= 400
    ? `   ✓ ${semDoc.status} recusado — ${erros(semDoc)}`
    : `   ⚠️  ${semDoc.status} ACEITOU sem documento — a premissa da T-225 precisa ser revista!`,
);

const comDoc = await chamar('POST', '/customers', {
  name: 'Spike T-209 Construtora',
  cpfCnpj: CNPJ_TESTE,
});
const customerId = comDoc.json?.id ?? null;
console.log(
  customerId
    ? `   ✓ cliente criado com CNPJ: ${customerId}`
    : `   ✗ ${comDoc.status} — ${erros(comDoc)}`,
);

// ── 2) Checkout RECORRENTE: Pix vale? endDate é obrigatório?
const itens = [{ name: 'PrumoLicita mensal', quantity: 1, value: 100 }];
const callback = {
  successUrl: 'https://app.prumolicita.com.br/assinatura?ok=1',
  cancelUrl: 'https://app.prumolicita.com.br/assinatura?cancel=1',
  expiredUrl: 'https://app.prumolicita.com.br/assinatura?exp=1',
};
const daquiADias = (d) =>
  new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

async function tentarCheckout(rotulo, corpo) {
  const r = await chamar('POST', '/checkouts', corpo);
  const ok = r.status >= 200 && r.status < 300;
  console.log(
    ok
      ? `   ✓ ${rotulo}: ACEITO (${r.json?.id ?? 'sem id'})`
      : `   ✗ ${rotulo}: ${r.status} — ${erros(r) || 'sem detalhe'}`,
  );
  return ok;
}

console.log('\n── 2) checkout RECORRENTE — o que o Asaas aceita de verdade');
await tentarCheckout('CREDIT_CARD + endDate', {
  billingTypes: ['CREDIT_CARD'],
  chargeTypes: ['RECURRENT'],
  minutesToExpire: 60,
  callback,
  items: itens,
  subscription: { cycle: 'MONTHLY', nextDueDate: daquiADias(7), endDate: daquiADias(400) },
});

// A pergunta que importa para SaaS: assinatura sem data de fim.
await tentarCheckout('CREDIT_CARD SEM endDate (assinatura de SaaS não acaba)', {
  billingTypes: ['CREDIT_CARD'],
  chargeTypes: ['RECURRENT'],
  minutesToExpire: 60,
  callback,
  items: itens,
  subscription: { cycle: 'MONTHLY', nextDueDate: daquiADias(7) },
});

// 🔬 A dúvida da T-208: Pix serve para recorrência?
await tentarCheckout('PIX em RECURRENT (a dúvida da T-208)', {
  billingTypes: ['PIX'],
  chargeTypes: ['RECURRENT'],
  minutesToExpire: 60,
  callback,
  items: itens,
  subscription: { cycle: 'MONTHLY', nextDueDate: daquiADias(7) },
});

// E boleto? A T-207 leu que o checkout NÃO aceita — confirmar contra a API.
await tentarCheckout('BOLETO no checkout (a T-207 leu que NÃO aceita)', {
  billingTypes: ['BOLETO'],
  chargeTypes: ['RECURRENT'],
  minutesToExpire: 60,
  callback,
  items: itens,
  subscription: { cycle: 'MONTHLY', nextDueDate: daquiADias(7) },
});

// ── 3) Assinatura direta com BOLETO — o "segundo caminho" da T-208.
if (customerId) {
  console.log('\n── 3) assinatura DIRETA com boleto (2º caminho, sem cartão)');
  const assin = await chamar('POST', '/subscriptions', {
    customer: customerId,
    billingType: 'BOLETO',
    value: 100,
    nextDueDate: daquiADias(7),
    cycle: 'MONTHLY',
    description: 'Spike T-209',
    externalReference: 'user-id-de-teste',
  });
  console.log(
    assin.json?.id
      ? `   ✓ assinatura por boleto criada: ${assin.json.id} (status ${assin.json.status})`
      : `   ✗ ${assin.status} — ${erros(assin)}`,
  );
}

// ── 4) Webhook: existe HMAC, ou só o token estático?
console.log('\n── 4) webhooks já configurados na conta (campos de autenticação)');
const wh = await chamar('GET', '/webhooks');
if (wh.status === 200) {
  const lista = wh.json?.data ?? [];
  console.log(`   ${lista.length} webhook(s) configurado(s).`);
  if (lista[0]) {
    // Só os NOMES dos campos — o valor do authToken é segredo.
    console.log(`   campos do objeto: ${Object.keys(lista[0]).join(', ')}`);
  }
  console.log(
    '   → Se não houver campo de segredo/assinatura além de `authToken`, ' +
      'confirma-se a regressão registrada na T-207 (token estático, sem HMAC).',
  );
} else {
  console.log(`   ✗ ${wh.status} — ${erros(wh)}`);
}

console.log(
  '\n⚠️  Este spike CRIA objetos no sandbox (cliente, checkouts, assinatura). ' +
    'É sandbox: não movimenta dinheiro real. Limpe pelo painel se quiser.',
);
