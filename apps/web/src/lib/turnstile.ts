// Cloudflare Turnstile (T-203). Sem dependência npm, mesmo padrão do lib/google.ts:
// o SDK é um script da própria Cloudflare, carregado SOB DEMANDA (só na tela de
// cadastro) — não pesa no bundle de quem já está logado.
//
// `render=explicit` de propósito, e não o auto-render por `class="cf-turnstile"`:
// o token é de USO ÚNICO, e esta é uma SPA que não navega no submit. Depois de um
// cadastro recusado a página continua viva com um token já queimado — sem o id do
// widget em mão não há como chamar `reset()`, e a segunda tentativa falharia
// sempre com `timeout-or-duplicate`.

const TURNSTILE_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileOpcoes {
  sitekey: string;
  /** Precisa casar com o @Turnstile(...) da rota no backend. */
  action?: string;
  callback?: (token: string) => void;
  'error-callback'?: (codigo?: string) => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
  theme?: 'auto' | 'light' | 'dark';
  size?: 'normal' | 'flexible' | 'compact';
  language?: string;
}

// Só o que tocamos do SDK — tipar a superfície mínima evita `any` solto no código.
interface TurnstileApi {
  render(el: HTMLElement, opcoes: TurnstileOpcoes): string | undefined;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Sitekey do widget. Ausente = proteção desligada no front: o widget não
 * renderiza e o cadastro segue sem ele.
 *
 * ⚠️ Ela é o par de `TURNSTILE_SECRET_KEY` na API, e as duas pontas degradam
 * INDEPENDENTES. Só um par completo protege de fato:
 *   - as duas presentes → protegido;
 *   - as duas ausentes  → sem proteção (dev, e é o estado de hoje em prod);
 *   - só a secret na API → **o cadastro PARA** (a API exige token, o front não
 *     manda). É a combinação a evitar: ao setar a secret, sete a sitekey junto.
 *   - só a sitekey aqui → widget aparece e não protege nada (a API não confere).
 */
export function turnstileSiteKey(): string | undefined {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || undefined;
}

let carregando: Promise<TurnstileApi> | null = null;

/** Carrega o SDK uma única vez (idempotente entre telas e re-renders). */
export function carregarTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  carregando ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // O `api.js` define window.turnstile antes de disparar o onload, mas o
      // contrato não promete ordem — checar evita um crash obscuro se mudar.
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('SDK do Turnstile carregou sem a API esperada'));
    };
    script.onerror = () => {
      // Deixa tentar de novo numa próxima montagem (rede pode voltar).
      carregando = null;
      reject(new Error('Não foi possível carregar a verificação de segurança'));
    };
    document.head.appendChild(script);
  });
  return carregando;
}
