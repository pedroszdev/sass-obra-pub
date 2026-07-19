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
import { useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { ApiError, resendVerification } from '../lib/api';

// Cooldown do botão de reenvio (T-171): impede spam de e-mail na mão do usuário.
// Espelha o teto do backend (tier EMAIL) — a barreira dura é lá; aqui é UX.
const COOLDOWN_S = 60;

// Bloqueio de uso do produto enquanto o e-mail não foi verificado (T-132). O
// onboarding NÃO passa por aqui (é rota separada); só as telas do produto.
export function VerifiqueEmailGate({ email }: { email: string }) {
  const { refreshUser } = useAuth();
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  const [checando, setChecando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Conta o cooldown de segundo em segundo enquanto > 0.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function reenviar() {
    setErro(null);
    setReenviando(true);
    try {
      await resendVerification();
      setReenviado(true);
      setCooldown(COOLDOWN_S);
    } catch (err) {
      // Mensagem já vem amigável em PT-BR (T-170): 429 vira "muitas tentativas…".
      setErro(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível reenviar agora. Tente de novo.',
      );
      // Se o backend barrou por rate-limit, também trava o botão localmente.
      if (err instanceof ApiError && err.status === 429) setCooldown(COOLDOWN_S);
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
              disabled={cooldown > 0}
            >
              {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar e-mail'}
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
