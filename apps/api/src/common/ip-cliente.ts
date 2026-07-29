import { isIP } from 'node:net';

// Quem é o IP do cliente — UM lugar só (T-204).
//
// Antes desta função havia TRÊS leituras divergentes (`email-throttler.guard`,
// `user-throttler.guard`, `admin-audit.interceptor`), todas fazendo
// `req.ips[0] ?? req.ip` por conta própria. Três cópias é como a correção volta
// pela metade: dá para consertar o rate limit e esquecer a auditoria. Regra num
// lugar só (§3.3).
//
// ── Por que `req.ips[0]` deixa de bastar com a Cloudflare na frente ──
//
// `req.ips` é o `X-Forwarded-For` parseado pelo Express (`trust proxy` ligado no
// main.ts). Hoje, com só o proxy do Render na frente, o XFF chega como
//
//     X-Forwarded-For: <ip real do cliente>
//
// e `ips[0]` é o IP real. Ao ligar a nuvem laranja (T-204), a Cloudflare
// **acrescenta** ao header em vez de substituí-lo, e um cliente que mande o
// header já preenchido produz
//
//     X-Forwarded-For: <o que o cliente inventou>, <ip real do cliente>
//                       ^^^^^^^^^^^^^^^^^^^^^^^^ ips[0]
//
// ou seja: `ips[0]` passa a ser um valor ESCOLHIDO PELO ATACANTE. Isso não
// derruba nada — quebra em silêncio e a favor dele: o rate limit por IP (T-104)
// vira contornável trocando um header, e o log de auditoria do /admin (T-182,
// rastreabilidade de acesso a dado pessoal, LGPD) grava IP mentiroso. Quem é
// autoritativo nesse cenário é o `CF-Connecting-IP`, que a Cloudflare
// sobrescreve sempre e o cliente não consegue forjar.
//
// ── Por que isso vem atrás de uma env, e não sempre ligado ──
//
// O header só é confiável quando a Cloudflare está DE FATO na frente. Enquanto
// o `api` está em DNS-only (estado de hoje, §8), qualquer um manda
// `CF-Connecting-IP: 1.2.3.4` direto para o Render — confiar nele agora seria
// ABRIR o mesmo furo que a T-204 fecha, só do outro lado. `TRUST_CF_CONNECTING_IP`
// é o interruptor: ausente/off = comportamento de hoje, byte a byte; ligue-o na
// MESMA janela em que a nuvem laranja acende no `api`. Se der falso positivo no
// rate limit, desligar a env volta ao estado anterior sem deploy de código.
const CF_HEADER = 'cf-connecting-ip';

/** Chave de fallback quando não há IP algum (requisição sem socket, teste). */
export const IP_DESCONHECIDO = 'desconhecido';

export interface RequestComIp {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  ips?: string[];
}

/**
 * A decisão, isolada e pura — é aqui que mora a regra, e é isto que o teste
 * cobre. Os parâmetros são os três candidatos já extraídos da requisição.
 */
export function escolherIp(params: {
  cfConnectingIp?: string | null;
  xffPrimeiro?: string | null;
  ipDireto?: string | null;
  confiaCloudflare: boolean;
}): string | null {
  const { cfConnectingIp, xffPrimeiro, ipDireto, confiaCloudflare } = params;
  if (confiaCloudflare) {
    // Só aceita o header se ele for um IP de verdade. A validação existe para o
    // caso de a env estar ligada sem a Cloudflare de fato na frente (config
    // errada, rollback do proxy): aí o header é lixo escolhido pelo cliente, e
    // cair no XFF é melhor que gravar "'; DROP" no log de auditoria.
    const limpo = normalizarIp(cfConnectingIp);
    if (limpo) return limpo;
  }
  // Caminho de hoje. Deliberadamente SEM validação de formato: validar aqui
  // mudaria o comportamento atual do rate limit, o que está fora do escopo
  // desta correção (§4.3) — a decisão nova é só a de cima.
  return xffPrimeiro?.trim() || ipDireto?.trim() || null;
}

/**
 * Adaptador: lê a requisição e a env, delega a decisão ao `escolherIp`.
 * É este que os guards e o interceptor chamam.
 */
export function ipDoCliente(req: RequestComIp): string | null {
  return escolherIp({
    cfConnectingIp: cabecalho(req, CF_HEADER),
    xffPrimeiro: req.ips?.length ? req.ips[0] : null,
    ipDireto: req.ip ?? null,
    confiaCloudflare: confiaEmCloudflare(),
  });
}

/** Idem, para quem precisa de string sempre (chave de throttle). */
export function ipDoClienteOuDesconhecido(req: RequestComIp): string {
  return ipDoCliente(req) ?? IP_DESCONHECIDO;
}

/** Lê a env a cada chamada de propósito: liga/desliga sem reiniciar o processo. */
export function confiaEmCloudflare(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = (env.TRUST_CF_CONNECTING_IP ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

// Header pode vir repetido (array) — nesse caso o primeiro valor. `isIP` é do
// node (`node:net`), cobre IPv4 e IPv6 e não custa dependência nova.
function normalizarIp(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const bruto = valor.split(',')[0].trim();
  return isIP(bruto) === 0 ? null : bruto;
}

function cabecalho(req: RequestComIp, nome: string): string | null {
  const v = req.headers?.[nome];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
