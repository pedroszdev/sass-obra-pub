// Redação do resumo de payload gravado na auditoria (T-182). LGPD/segurança: o
// log guarda QUEM fez O QUÊ, não um espelho de dados sensíveis. Nunca gravamos o
// body cru.
//
// Regras:
//   - chave sensível (senha, token, segredo, etc.) → "[redigido]";
//   - string longa → truncada;
//   - objeto/array aninhado → "[objeto]"/"[array]" (não descemos — evita PII
//     escondida e blob gigante);
//   - no máximo N chaves de topo.

const SENSITIVE =
  /senha|password|pass|token|secret|authorization|auth|cvv|card/i;
const MAX_STRING = 120;
const MAX_KEYS = 30;

function redigirValor(chave: string, valor: unknown): unknown {
  if (SENSITIVE.test(chave)) return '[redigido]';
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') {
    return valor.length > MAX_STRING ? `${valor.slice(0, MAX_STRING)}…` : valor;
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  if (Array.isArray(valor)) return '[array]';
  return '[objeto]';
}

export function resumirPayload(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const entradas = Object.entries(body as Record<string, unknown>);
  if (entradas.length === 0) return null;

  const resumo: Record<string, unknown> = {};
  let n = 0;
  for (const [chave, valor] of entradas) {
    if (n >= MAX_KEYS) {
      resumo['…'] = `+${entradas.length - MAX_KEYS} campos`;
      break;
    }
    resumo[chave] = redigirValor(chave, valor);
    n += 1;
  }
  return resumo;
}
