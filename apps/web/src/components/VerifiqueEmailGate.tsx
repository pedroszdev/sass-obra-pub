import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconMailForward } from '@tabler/icons-react';
import { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { resendVerification } from '../lib/api';

// Bloqueio de uso do produto enquanto o e-mail não foi verificado (T-132). O
// onboarding NÃO passa por aqui (é rota separada); só as telas do produto.
export function VerifiqueEmailGate({ email }: { email: string }) {
  const { refreshUser } = useAuth();
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  const [checando, setChecando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function reenviar() {
    setErro(null);
    setReenviando(true);
    try {
      await resendVerification();
      setReenviado(true);
    } catch {
      setErro('Não foi possível reenviar agora. Tente de novo.');
    } finally {
      setReenviando(false);
    }
  }

  async function jaConfirmei() {
    setChecando(true);
    try {
      await refreshUser(); // se já verificou, o gate some
    } catch {
      /* best-effort */
    } finally {
      setChecando(false);
    }
  }

  return (
    <Box
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      p="xl"
    >
      <Card withBorder radius="lg" p="xl" maw={460} w="100%">
        <Stack gap="md" align="center" ta="center">
          <ThemeIcon variant="light" color="orange" radius="xl" size={56}>
            <IconMailForward size={28} />
          </ThemeIcon>
          <Box>
            <Title order={2} fz={22} style={{ letterSpacing: '-0.01em' }}>
              Confirme seu e-mail
            </Title>
            <Text c="dimmed" fz="sm" mt={6} maw={380}>
              Enviamos um link de confirmação para <b>{email}</b>. Confirme para
              liberar o PrumoLicita. (Seu perfil já foi salvo — nada se perde.)
            </Text>
          </Box>

          {reenviado && (
            <Alert color="apto" variant="light" radius="md" w="100%">
              E-mail reenviado. Confira também a caixa de spam.
            </Alert>
          )}
          {erro && (
            <Alert color="alerta" variant="light" radius="md" w="100%">
              {erro}
            </Alert>
          )}

          <Group gap="sm" mt="xs">
            <Button
              color="orange"
              onClick={() => void jaConfirmei()}
              loading={checando}
            >
              Já confirmei
            </Button>
            <Button
              variant="default"
              onClick={() => void reenviar()}
              loading={reenviando}
            >
              Reenviar e-mail
            </Button>
          </Group>

          <Text fz="xs" c="dimmed">
            E-mail errado?{' '}
            <Anchor href="/ajuda" fz="xs">
              Fale com o suporte
            </Anchor>
            .
          </Text>
        </Stack>
      </Card>
    </Box>
  );
}
