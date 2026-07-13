import { Box, Center, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/auth-context';

// Volta do login com Google por redirect (T-126b).
//
// Quando o usuário chega aqui a sessão JÁ existe: o callback da API validou o
// id_token e mandou o cookie httpOnly de refresh no 302. Falta só o front pegar
// um access token com esse cookie, descobrir quem é, e rotear. É a tela de um
// piscar de olhos — se algo falhar, volta ao login com o aviso.
export function EntrandoPage() {
  const { entrarPeloCookie } = useAuth();
  const navigate = useNavigate();
  // O StrictMode monta o efeito duas vezes em dev; o refresh é rotativo (o
  // segundo uso do mesmo cookie falharia), então roda uma vez só.
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;

    entrarPeloCookie()
      .then((me) => {
        // Conta recém-criada pelo Google nasce sem UF — sem região a captação
        // (T-18) não roda para ela, então o onboarding vem antes da home.
        navigate(me.uf ? '/' : '/onboarding', { replace: true });
      })
      .catch(() => {
        navigate('/login?erro=google', { replace: true });
      });
  }, [entrarPeloCookie, navigate]);

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
