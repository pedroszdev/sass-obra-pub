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

// SameSite=Lax SEMPRE (T-152); Secure só em produção (sobre o http do localhost o
// Secure impediria o cookie).
//
// POR QUE Lax, E POR QUE ANTES ERA None: enquanto front e API viveram em
// `*.onrender.com`, eles eram sites DIFERENTES (`onrender.com` está na public
// suffix list) e este cookie era de TERCEIRO para o front — `Lax` jamais o
// enviaria. Só `None` funcionava, e mesmo assim os navegadores que bloqueiam
// terceiros o descartavam: o `/auth/refresh` respondia 401 e a sessão morria em
// 15min. A correção foi de INFRA (CLAUDE.md §8): front e API viraram subdomínios
// do MESMO domínio (app./api.prumolicita.com.br).
//
// Subdomínios do mesmo domínio registrável são o MESMO SITE para o navegador —
// então `Lax` acompanha normalmente as chamadas do front para a API, e a razão
// que obrigava o `None` deixou de existir. Com `None`, o cookie viajava em
// requisição disparada por QUALQUER site: um site malicioso não conseguia LER a
// resposta (o CORS barra), mas conseguia forçar rotação do refresh ou um
// /auth/logout na vítima — CSRF de sabotagem. `Lax` fecha isso: requisição vinda
// de outro site simplesmente não leva o cookie.
//
// ⚠️ NÃO copie este `Lax` para o cookie do nonce do Google
// (google-nonce-cookie.ts): aquele PRECISA ser `None`, porque acompanha um POST
// que vem do accounts.google.com — que é, de fato, outro site.
//
// ⚠️ E não volte a servir front e API em sites diferentes: aí nem `Lax` nem
// `None` salvam (é o que já quebrou uma vez).
function baseOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
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
