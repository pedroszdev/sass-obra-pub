import { randomBytes } from 'crypto';
import { CookieRequest, CookieResponse, readCookie } from '../refresh-cookie';

// Anti-CSRF do login com Google por redirect (T-126b).
//
// POR QUE NÃO USAMOS O `g_csrf_token` DO GOOGLE: o SDK grava aquele cookie na
// origem da PÁGINA e repete o valor no corpo do POST, e o backend compara os dois.
// Isso exige que o `login_uri` seja do mesmo site da página — e o nosso front é um
// static site, que não recebe POST nenhum. O callback tem de viver na API.
//
// A troca: um nonce NOSSO. A API o gera, guarda num cookie DELA (gravado numa
// navegação de topo, em /auth/google/start — ver o controller) e o manda ao Google,
// que o carimba dentro do id_token assinado. No callback comparamos o nonce do
// token com o do cookie: mesma garantia do double-submit — a resposta só vale para
// um pedido que ESTA API originou.
export const GOOGLE_NONCE_COOKIE = 'obrapub_gnonce';

// O nonce só precisa sobreviver ao tempo de tela do Google (escolher a conta).
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutos

// SameSite=None + Secure SEMPRE — inclusive em dev, ao contrário do cookie de
// refresh. Este cookie precisa viajar num POST cross-site vindo do Google, e
// `Lax` só acompanha navegação de topo por GET. Os navegadores tratam
// `http://localhost` como origem segura, então o `Secure` não atrapalha o dev.
function baseOptions(): {
  httpOnly: true;
  secure: true;
  sameSite: 'none';
  path: string;
} {
  return { httpOnly: true, secure: true, sameSite: 'none', path: '/auth' };
}

export function criarNonce(): string {
  return randomBytes(24).toString('base64url');
}

export function setGoogleNonceCookie(res: CookieResponse, nonce: string): void {
  res.cookie(GOOGLE_NONCE_COOKIE, nonce, {
    ...baseOptions(),
    maxAge: NONCE_TTL_MS,
  });
}

export function readGoogleNonceCookie(req: CookieRequest): string | null {
  return readCookie(req, GOOGLE_NONCE_COOKIE);
}

// O nonce é de uso único: some assim que o callback o consome (bem ou mal).
export function clearGoogleNonceCookie(res: CookieResponse): void {
  res.clearCookie(GOOGLE_NONCE_COOKIE, baseOptions());
}
