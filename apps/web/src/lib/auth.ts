// Armazenamento do ACCESS token no localStorage + um pequeno pub/sub para que o
// AuthProvider reaja a mudanças (login, logout, expiração) mesmo quando elas
// partem de fora do React (ex.: o cliente HTTP limpando o token após um 401).
// O REFRESH token não vive aqui (T-119a): fica num cookie httpOnly gerido pelo
// backend — o JS do front não o lê nem o guarda.

const ACCESS_KEY = 'obrapub.accessToken';

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Inscreve um ouvinte para mudanças de autenticação. Devolve o cancelador. */
export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function setAccessToken(accessToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  emit();
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  emit();
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

// Propaga mudanças de auth ENTRE ABAS (T-119c). O evento `storage` dispara nas
// OUTRAS abas quando esta grava/limpa os tokens: sem isto, deslogar numa aba não
// desloga as demais, e uma aba não enxerga o token rotacionado por outra. `key`
// null cobre `localStorage.clear()`.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === ACCESS_KEY || e.key === null) {
      emit();
    }
  });
}
