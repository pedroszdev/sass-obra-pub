import { createHmac, timingSafeEqual } from 'node:crypto';

// Token de descadastro do e-mail de obra do dia (sem login). É um HMAC do userId
// com um segredo do servidor — stateless, infalsificável e reversível (o dono
// pode reativar nas preferências). Baixo risco: no pior caso alguém descadastra
// outra pessoa de UM e-mail de marketing, que ela reativa em 1 clique.
//
// Formato: `<userId base64url>.<hmac base64url>`.

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function assinar(userId: string, segredo: string): string {
  return b64url(createHmac('sha256', segredo).update(userId).digest());
}

export function gerarTokenDescadastro(userId: string, segredo: string): string {
  const id = b64url(Buffer.from(userId, 'utf8'));
  return `${id}.${assinar(userId, segredo)}`;
}

// Devolve o userId se o token é válido; null caso contrário. Comparação em tempo
// constante (a diferença de tempo vazaria quantos bytes o atacante acertou).
export function verificarTokenDescadastro(
  token: string,
  segredo: string,
): string | null {
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [idB64, sig] = partes;
  let userId: string;
  try {
    userId = Buffer.from(
      idB64.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
  } catch {
    return null;
  }
  if (!userId) return null;
  const esperada = assinar(userId, segredo);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}
