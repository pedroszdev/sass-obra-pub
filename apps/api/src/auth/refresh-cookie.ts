// Forma mínima do Request/Response do Express que usamos — tipada à mão para não
// puxar `@types/express` (mesmo padrão do `UploadedPdf`/multer). NestJS injeta o
// objeto real do Express em runtime; só tocamos nestes campos/métodos.
export interface CookieResponse {
  cookie(
    name: string,
    value: string,
    options: Record<string, unknown>,
  ): unknown;
  clearCookie(name: string, options: Record<string, unknown>): unknown;
}
export interface CookieRequest {
  headers: { cookie?: string };
}

/** Lê um cookie do header — evita a dependência cookie-parser. */
export function readCookie(req: CookieRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const parte of header.split(';')) {
    const eq = parte.indexOf('=');
    if (eq === -1) continue;
    if (parte.slice(0, eq).trim() === name) {
      return decodeURIComponent(parte.slice(eq + 1).trim());
    }
  }
  return null;
}

// Transporte do refresh token via cookie httpOnly (T-119a). httpOnly = o JS do
// front NÃO lê → um XSS não rouba a sessão de 7 dias. O access token de 15min
// segue no storage do front (dano muito menor). Path /auth: o cookie só é
// enviado nas rotas de auth (refresh/logout), reduzindo a exposição.
export const REFRESH_COOKIE = 'obrapub_rt';

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

// Em produção o front e a API são cross-site (subdomínios `*.onrender.com` estão
// no public suffix list) → exige SameSite=None + Secure. Em dev tudo é localhost
// (mesmo site; a porta não conta para SameSite) → Lax sem Secure, que funciona
// sobre http. Dirigido por NODE_ENV.
function baseOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'none' | 'lax';
  path: string;
} {
  const prod = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/auth',
  };
}

export function setRefreshCookie(res: CookieResponse, token: string): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(), maxAge: SETE_DIAS_MS });
}

export function clearRefreshCookie(res: CookieResponse): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}

export function readRefreshCookie(req: CookieRequest): string | null {
  return readCookie(req, REFRESH_COOKIE);
}
