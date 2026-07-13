import { Alert, Box, Skeleton } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { googleNonce } from '../lib/api';
import { carregarGoogle, googleClientId, googleLoginUri } from '../lib/google';

interface Props {
  /** `redirect` (T-126b): o Google navega a página inteira e devolve o id_token
   *  num POST para a nossa API, que cria a sessão e traz o usuário de volta em
   *  /entrando. É o fluxo de entrar/cadastrar.
   *
   *  `popup`: o id_token volta pelo JS, no `onCredential`. Só serve a quem precisa
   *  do token NA HORA e sem sair da tela — hoje, a reautenticação para excluir a
   *  conta (um redirect ali perderia o contexto do que se ia confirmar). */
  modo?: 'popup' | 'redirect';
  /** Recebe o id_token do Google. Obrigatório no modo popup, ignorado no redirect
   *  (lá a resposta não passa pelo JavaScript). */
  onCredential?: (idToken: string) => void;
  /** Texto do botão do Google. */
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  /** Bloqueia o clique (ex.: aceite dos termos ainda não marcado — T-102). */
  disabled?: boolean;
}

// Botão "Entrar com Google" (T-126). Renderizado pelo SDK do Google dentro do
// nosso container — o desenho é dele, por exigência da marca.
//
// Sem VITE_GOOGLE_CLIENT_ID o componente não renderiza NADA: melhor não oferecer
// o caminho do que oferecer um botão que sempre falha (o backend responde 503).
export function GoogleButton({
  modo = 'popup',
  onCredential,
  text = 'continue_with',
  disabled,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const clientId = googleClientId();

  // O SDK chama o callback capturado na inicialização. Uma ref mantém a versão
  // atual de `onCredential` sem re-inicializar o botão a cada render do pai.
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    if (!clientId || !container.current) return;
    let ativo = true;

    // No redirect o nonce vem ANTES do botão: é ele que o Google carimba no
    // id_token e que o callback da API confere. Se o nonce falhar, o botão não
    // aparece — um clique ali terminaria em erro lá na volta.
    const preparar = async () => {
      const google = await carregarGoogle();
      const nonce =
        modo === 'redirect' ? (await googleNonce()).nonce : undefined;
      if (!ativo || !container.current) return;

      google.initialize({
        client_id: clientId,
        // Nada de login automático: entrar é ação explícita do usuário.
        auto_select: false,
        ...(modo === 'redirect'
          ? { ux_mode: 'redirect' as const, login_uri: googleLoginUri(), nonce }
          : { callback: (res) => callback.current?.(res.credential) }),
      });
      google.renderButton(container.current, {
        theme: 'outline',
        size: 'large',
        text,
        locale: 'pt-BR',
      });
      setPronto(true);
    };

    preparar().catch((e: unknown) => {
      if (ativo) setErro(e instanceof Error ? e.message : 'Falha no Google');
    });

    return () => {
      ativo = false;
    };
  }, [clientId, text, modo]);

  if (!clientId) return null;

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
