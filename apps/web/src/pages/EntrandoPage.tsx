import { Box, Center, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/auth-context';
import { caminhoInternoSeguro } from '../lib/navegacao';

// Volta do login com Google por redirect (T-126b) — e do Checkout da Stripe
// (T-169), via `?next=`.
//
// Quando o usuário chega aqui a sessão JÁ existe (nos cookies httpOnly): no
// Google o callback da API mandou o refresh no 302; na volta do Checkout são os
// cookies de sessão que já estavam lá. Falta só o front pegar um access token
// com esse cookie, descobrir quem é, e rotear — re-hidratar aqui evita cair na
// rota protegida sem sessão e ser deslogado. É a tela de um piscar de olhos.
export function EntrandoPage() {
  const { entrarPeloCookie } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Para onde ir depois de entrar. Só caminho interno (anti open-redirect),
  // mesmo vindo de uma URL nossa (o success_url do Checkout).
  const next = caminhoInternoSeguro(params.get('next'));
  // O StrictMode monta o efeito duas vezes em dev; o refresh é rotativo (o
  // segundo uso do mesmo cookie falharia), então roda uma vez só.
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;

    entrarPeloCookie()
      .then((me) => {
        // Volta do Checkout (T-169): segue para o `next` (ex.: /assinatura?
        // status=ok). Sem `next` é o fluxo do Google: conta nova nasce sem UF —
        // sem região a captação (T-18) não roda, então o onboarding vem antes.
        navigate(next ?? (me.uf ? '/' : '/onboarding'), { replace: true });
      })
      .catch(() => {
        // Sem `next` é o fluxo do Google (mostra o aviso específico); com `next`
        // (volta do Checkout) manda para o login neutro.
        navigate(next ? '/login' : '/login?erro=google', { replace: true });
      });
  }, [entrarPeloCookie, navigate, next]);

  return (
    <Center h="100vh" bg="var(--mantine-color-concreto-2)">
      <Stack align="center" gap="lg">
        <Logo variant="onLight" size={30} />
        <Box>
          <Loader color="orange" />
        </Box>
        <Text fz="sm" c="dimmed">
          Entrando…
        </Text>
      </Stack>
    </Center>
  );
}
