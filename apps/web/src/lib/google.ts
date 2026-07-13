// Google Identity Services (T-126). Sem dependência npm: o SDK é um script do
// próprio Google, carregado sob demanda (só nas telas de login/cadastro e na
// confirmação de exclusão de conta) — não pesa no bundle de quem já está logado.

import { API_URL } from './api';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Superfície mínima do SDK que usamos. O SDK é `any` por natureza (script global);
// tipar só o que tocamos evita `any` solto pelo código.
interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue';
      size?: 'large' | 'medium';
      width?: number;
      text?: 'signin_with' | 'signup_with' | 'continue_with';
      locale?: string;
    },
  ): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

/** Client id do Google. Ausente = o produto roda sem login social (o botão some,
 *  e o backend responde 503 se alguém chamar o endpoint mesmo assim). */
export function googleClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || undefined;
}

/** Onde começa o login com Google por redirect (T-126b). É uma NAVEGAÇÃO, não um
 *  fetch: a API precisa estar no topo para gravar o cookie do nonce como cookie
 *  primário — gravado a partir de um fetch daqui ele seria cookie de terceiro, e
 *  Safari/Firefox o descartariam (foi o que quebrou em produção). A partir daí a
 *  API leva o usuário ao Google e o traz de volta em /entrando. */
export function googleStartUrl(): string {
  return `${API_URL}/auth/google/start`;
}

let carregando: Promise<GoogleIdApi> | null = null;

/** Carrega o SDK uma única vez (idempotente entre telas e re-renders). */
export function carregarGoogle(): Promise<GoogleIdApi> {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  carregando ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error('SDK do Google carregou sem a API esperada'));
    };
    script.onerror = () => {
      // Deixa tentar de novo numa próxima montagem (rede pode voltar).
      carregando = null;
      reject(new Error('Não foi possível carregar o Google'));
    };
    document.head.appendChild(script);
  });
  return carregando;
}
