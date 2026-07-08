import { Alert, Anchor, Box, Button, Loader, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/auth-context';
import { verifyEmail } from '../lib/api';

type Estado = 'verificando' | 'ok' | 'erro';

export function VerificarEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status, refreshUser } = useAuth();
  const [estado, setEstado] = useState<Estado>(token ? 'verificando' : 'erro');
  const jaRodou = useRef(false);

  useEffect(() => {
    if (!token || jaRodou.current) return;
    jaRodou.current = true; // evita rodar 2x (StrictMode)
    verifyEmail(token)
      .then(async () => {
        setEstado('ok');
        // Se estiver logado, re-hidrata pra o gate de e-mail sumir na hora.
        if (status === 'authenticated') await refreshUser().catch(() => {});
      })
      .catch(() => setEstado('erro'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--mantine-color-concreto-2)',
      }}
      p="xl"
    >
      <Stack gap="lg" w="100%" maw={380} align="center">
        <Logo variant="onLight" size={28} />

        {estado === 'verificando' && (
          <Stack gap="sm" align="center">
            <Loader />
            <Text c="dimmed" fz="sm">
              Confirmando seu e-mail…
            </Text>
          </Stack>
        )}

        {estado === 'ok' && (
          <>
            <Alert
              color="apto"
              variant="light"
              icon={<IconCircleCheck size={18} />}
              radius="md"
              w="100%"
            >
              E-mail confirmado! Seu acesso ao PrumoLicita está liberado.
            </Alert>
            <Button component={Link} to="/" size="md" fullWidth>
              Ir para o início
            </Button>
          </>
        )}

        {estado === 'erro' && (
          <Alert
            color="alerta"
            variant="light"
            icon={<IconAlertTriangle size={18} />}
            radius="md"
            w="100%"
          >
            Link inválido ou expirado. Entre na sua conta e peça um novo e-mail de
            confirmação.
          </Alert>
        )}

        <Text fz="sm" ta="center">
          <Anchor component={Link} to="/login" fw={600}>
            Ir para o login
          </Anchor>
        </Text>
      </Stack>
    </Box>
  );
}
