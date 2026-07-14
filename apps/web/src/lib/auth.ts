// Estado de sessão no front (T-155).
//
// NÃO HÁ MAIS TOKEN AQUI. Antes o access token (15 min) vivia no localStorage e
// era anexado à mão em cada requisição; hoje os DOIS tokens (access e refresh)
// são cookies httpOnly, que o navegador manda sozinho (`credentials: 'include'`)
// e o JS da página não consegue ler. Um XSS não acha credencial para roubar.
//
// O que sobrou aqui é só um SINAL, não uma credencial: um marcador de "há sessão"
// para (a) o boot saber se vale a pena chamar /users/me e (b) as OUTRAS ABAS
// reagirem ao logout (o evento `storage` só dispara entre abas). Ele não dá
// acesso a nada — a verdade sobre a sessão está no cookie e no backend.

const SESSAO_KEY = 'obrapub.sessao';

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

/** Marca que existe sessão (chamado após login/cadastro/refresh bem-sucedido). */
export function marcarSessao(): void {
  localStorage.setItem(SESSAO_KEY, '1');
  emit();
}

/** Apaga o marcador. Os COOKIES são limpos pelo backend (/auth/logout). */
export function limparSessao(): void {
  localStorage.removeItem(SESSAO_KEY);
  emit();
}

/**
 * Havia sessão da última vez? É uma DICA, não uma garantia: o cookie pode ter
 * expirado, e só o backend sabe. Serve para o boot não chamar /users/me à toa
 * em quem nunca entrou.
 */
export function temSessao(): boolean {
  return localStorage.getItem(SESSAO_KEY) === '1';
}

// Propaga logout/login ENTRE ABAS (T-119c): o evento `storage` dispara nas OUTRAS
// abas quando esta grava/limpa o marcador. `key` null cobre `localStorage.clear()`.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SESSAO_KEY || e.key === null) {
      emit();
    }
  });
}
