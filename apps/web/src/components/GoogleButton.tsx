import { Alert, Box, Skeleton, UnstyledButton } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { carregarGoogle, googleClientId, googleStartUrl } from '../lib/google';

interface Props {
  /** `redirect` (T-126b): entrar/cadastrar. NÃO usa o SDK — o clique é uma
   *  navegação para a nossa API, que grava o cookie do nonce (como cookie
   *  primário, o que um fetch daqui não conseguiria) e leva o usuário ao Google.
   *
   *  `popup`: o SDK do Google devolve o id_token pelo JS, no `onCredential`. Só
   *  serve a quem precisa do token NA HORA e sem sair da tela — hoje, a
   *  reautenticação para excluir a conta. */
  modo?: 'popup' | 'redirect';
  /** Recebe o id_token do Google. Só existe no modo popup. */
  onCredential?: (idToken: string) => void;
  /** Texto do botão. No modo popup é o rótulo do SDK; no redirect, o nosso. */
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  /** Bloqueia o clique (ex.: aceite dos termos ainda não marcado — T-102). */
  disabled?: boolean;
}

const ROTULOS: Record<NonNullable<Props['text']>, string> = {
  signin_with: 'Entrar com o Google',
  signup_with: 'Cadastrar com o Google',
  continue_with: 'Continuar com o Google',
};

// Logo "G" oficial. Vai inline porque o botão é nosso: as diretrizes de marca do
// Google exigem o logo exato, sobre fundo branco, sem recolorir.
function LogoG() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

// Botão "Entrar com Google" (T-126).
//
// Sem VITE_GOOGLE_CLIENT_ID o componente não renderiza NADA: melhor não oferecer
// o caminho do que oferecer um botão que sempre falha (o backend responde 503).
export function GoogleButton({
  modo = 'popup',
  onCredential,
  text = 'continue_with',
  disabled,
}: Props) {
  const clientId = googleClientId();
  if (!clientId) return null;
  return modo === 'redirect' ? (
    <BotaoRedirect rotulo={ROTULOS[text]} disabled={disabled} />
  ) : (
    <BotaoPopup clientId={clientId} onCredential={onCredential} text={text} disabled={disabled} />
  );
}

// Botão nosso, desenhado conforme as diretrizes do Google (fundo branco, borda
// cinza, logo à esquerda, Roboto). O clique é uma navegação de página — é ela
// que põe a API no topo, e é disso que o cookie do nonce depende.
function BotaoRedirect({
  rotulo,
  disabled,
}: {
  rotulo: string;
  disabled?: boolean;
}) {
  return (
    <UnstyledButton
      component="a"
      href={disabled ? undefined : googleStartUrl()}
      aria-disabled={disabled || undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: 40,
        borderRadius: 4,
        border: '1px solid #747775',
        backgroundColor: '#fff',
        color: '#1f1f1f',
        fontFamily: 'Roboto, Arial, sans-serif',
        fontSize: 14,
        fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <LogoG />
      {rotulo}
    </UnstyledButton>
  );
}

// Botão renderizado pelo SDK do Google — o desenho é dele, por exigência da
// marca. Continua no fluxo de popup (reautenticação no Perfil).
function BotaoPopup({
  clientId,
  onCredential,
  text,
  disabled,
}: {
  clientId: string;
  onCredential?: (idToken: string) => void;
  text: NonNullable<Props['text']>;
  disabled?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  // O SDK chama o callback capturado na inicialização. Uma ref mantém a versão
  // atual de `onCredential` sem re-inicializar o botão a cada render do pai.
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    if (!container.current) return;
    let ativo = true;

    carregarGoogle()
      .then((google) => {
        if (!ativo || !container.current) return;
        google.initialize({
          client_id: clientId,
          callback: (res) => callback.current?.(res.credential),
          // Nada de login automático: entrar é ação explícita do usuário.
          auto_select: false,
        });
        google.renderButton(container.current, {
          theme: 'outline',
          size: 'large',
          text,
          locale: 'pt-BR',
        });
        setPronto(true);
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : 'Falha no Google');
      });

    return () => {
      ativo = false;
    };
  }, [clientId, text]);

  if (erro) {
    return (
      <Alert color="red" variant="light">
        {erro}. Use e-mail e senha, ou tente de novo.
      </Alert>
    );
  }

  return (
    <>
      {!pronto && <Skeleton height={40} radius="sm" />}
      {/* pointerEvents corta o clique sem esconder o botão: o usuário vê que o
          caminho existe e entende que falta marcar o aceite. */}
      <Box
        ref={container}
        style={{
          display: pronto ? 'block' : 'none',
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      />
    </>
  );
}
