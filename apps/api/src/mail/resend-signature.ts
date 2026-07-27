import { createHmac, timingSafeEqual } from 'node:crypto';

// Verificação da assinatura do webhook do Resend (T-193). O Resend assina os
// webhooks pelo padrão do Svix — o mesmo espírito da assinatura da Stripe: quem
// faz o POST é terceiro, sem JWT nosso, e o que autentica é a assinatura sobre o
// CORPO CRU. Verificamos à mão (HMAC-SHA256 com `crypto` nativo), sem SDK novo.
//
// Esquema do Svix:
//   - headers: `svix-id`, `svix-timestamp`, `svix-signature`.
//   - segredo: `whsec_<base64>` (do painel do Resend); a chave é o base64 depois
//     do prefixo `whsec_`.
//   - conteúdo assinado = `${id}.${timestamp}.${corpoCru}`.
//   - assinatura esperada = base64(HMAC_SHA256(chave, conteúdo)).
//   - o header `svix-signature` traz uma lista separada por espaço de `v1,<sig>`
//     (pode haver mais de uma, em rotação de segredo) — basta uma bater.

// Tolerância do timestamp: rejeita evento muito velho/futuro (replay). O Svix usa
// 5 min como padrão.
const TOLERANCIA_MS = 5 * 60 * 1000;

export interface SvixHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

function chaveDoSegredo(segredo: string): Buffer {
  const base64 = segredo.startsWith('whsec_') ? segredo.slice(6) : segredo;
  return Buffer.from(base64, 'base64');
}

function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual lança com tamanhos diferentes; o tamanho não é segredo aqui
  // (é sempre um HMAC-SHA256 base64), mas comparamos o length antes por segurança.
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Confere a assinatura Svix do webhook do Resend sobre o corpo CRU. Retorna true
 * só quando o segredo está configurado, os headers estão presentes, o timestamp
 * está dentro da tolerância e alguma das assinaturas `v1` bate. Nunca lança.
 */
export function verificarAssinaturaResend(
  corpoCru: Buffer,
  headers: SvixHeaders,
  segredo: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!segredo?.trim()) return false;
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  // Timestamp em segundos (epoch). Fora da janela → replay/relógio torto.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now.getTime() - ts * 1000) > TOLERANCIA_MS) return false;

  const conteudo = `${id}.${timestamp}.${corpoCru.toString('utf8')}`;
  const esperada = createHmac('sha256', chaveDoSegredo(segredo.trim()))
    .update(conteudo)
    .digest('base64');

  // Cada entrada é `v<versao>,<assinatura>`. Só a v1 nos interessa hoje.
  for (const parte of signature.split(' ')) {
    const [versao, sig] = parte.split(',');
    if (versao === 'v1' && sig && iguaisEmTempoConstante(sig, esperada)) {
      return true;
    }
  }
  return false;
}
