import { Alert, Box, Skeleton } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { carregarGoogle, googleClientId } from '../lib/google';

interface Props {
  /** Recebe o id_token do Google. Quem chama decide o que fazer com ele
   *  (entrar, cadastrar, confirmar exclusão de conta). */
  onCredential: (idToken: string) => void;
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
export function GoogleButton({ onCredential, text = 'continue_with', disabled }: Props) {
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

    carregarGoogle()
      .then((google) => {
        if (!ativo || !container.current) return;
        google.initialize({
          client_id: clientId,
          callback: (res) => callback.current(res.credential),
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
