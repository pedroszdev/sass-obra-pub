import { Alert, Box, Skeleton } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { carregarTurnstile, turnstileSiteKey } from '../lib/turnstile';

interface Props {
  /** Precisa casar com o `@Turnstile(...)` da rota no backend. */
  action: string;
  /** Token pronto para enviar, ou `null` quando não há token válido no momento. */
  onToken: (token: string | null) => void;
  /**
   * Bump deste número faz o widget resetar e emitir um token NOVO. O pai
   * incrementa depois de um submit recusado: o token é de uso único, e sem o
   * reset a segunda tentativa mandaria o mesmo token queimado (a Cloudflare
   * responderia `timeout-or-duplicate` para sempre).
   */
  resetSinal?: number;
}

// Widget do Turnstile (T-203) — proteção do cadastro contra bot.
//
// Sem VITE_TURNSTILE_SITE_KEY não renderiza NADA e nunca chama `onToken`. Cabe ao
// pai tratar a ausência como "não exigir token" (é a degradação combinada com a
// API, que sem a secret não confere nada — ver lib/turnstile.ts).
export function TurnstileWidget({ action, onToken, resetSinal = 0 }: Props) {
  const sitekey = turnstileSiteKey();
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  // ⚠️ O callback vai numa ref de propósito. O SDK captura as funções UMA vez, no
  // render do widget; se `onToken` entrasse nas deps do efeito, cada render do pai
  // (que muda a cada tecla digitada no formulário) destruiria e recriaria o widget
  // — desafio piscando na tela, token perdido, e o caminho conhecido para o loop
  // de render. As deps do efeito abaixo são só valores estáveis.
  const emitir = useRef(onToken);
  emitir.current = onToken;

  useEffect(() => {
    if (!sitekey || !container.current) return;
    let ativo = true;

    carregarTurnstile()
      .then((turnstile) => {
        if (!ativo || !container.current) return;
        widgetId.current = turnstile.render(container.current, {
          sitekey,
          action,
          // Tema fixo em claro: o formulário de cadastro é claro (concreto-2), e
          // `auto` seguiria o SO — widget escuro sobre form claro.
          theme: 'light',
          // `flexible` acompanha a largura da coluna do formulário (400px).
          size: 'flexible',
          language: 'pt-BR',
          callback: (token) => emitir.current(token),
          // Token vive ~300s. Expirado é o mesmo que não ter: avisa o pai (que
          // volta a travar o submit) e pede um novo à Cloudflare.
          'expired-callback': () => {
            emitir.current(null);
            if (widgetId.current) turnstile.reset(widgetId.current);
          },
          'timeout-callback': () => {
            emitir.current(null);
            if (widgetId.current) turnstile.reset(widgetId.current);
          },
          'error-callback': () => {
            emitir.current(null);
            setErro(
              'Não foi possível carregar a verificação de segurança. Recarregue a página.',
            );
          },
        });
        setPronto(true);
      })
      .catch((e: unknown) => {
        if (ativo) {
          setErro(
            e instanceof Error
              ? e.message
              : 'Falha na verificação de segurança.',
          );
        }
      });

    return () => {
      ativo = false;
      // Tira o widget do DOM na desmontagem: sem isto, voltar à tela deixaria
      // widget órfão e o SDK reclamaria de container já usado.
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = undefined;
      }
    };
  }, [sitekey, action]);

  // Reset a pedido do pai. Ignora o valor inicial: só reage a mudanças.
  const ultimoSinal = useRef(resetSinal);
  useEffect(() => {
    if (resetSinal === ultimoSinal.current) return;
    ultimoSinal.current = resetSinal;
    if (widgetId.current && window.turnstile) {
      emitir.current(null);
      window.turnstile.reset(widgetId.current);
    }
  }, [resetSinal]);

  if (!sitekey) return null;

  if (erro) {
    return (
      <Alert color="alerta" variant="light">
        {erro}
      </Alert>
    );
  }

  return (
    <>
      {!pronto && <Skeleton height={65} radius="sm" />}
      <Box ref={container} style={{ display: pronto ? 'block' : 'none' }} />
    </>
  );
}
