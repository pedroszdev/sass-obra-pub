import {
  Alert,
  Anchor,
  Box,
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/auth-context';
import { ApiError } from '../lib/api';

interface LocationState {
  from?: { pathname: string };
}

const SELLING_POINTS = [
  'Obras da sua região, automático',
  'A gente diz se você está apto',
  'Edital de 80 páginas em 1 tela',
];

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Já autenticado (ou recém-logado): sai da tela de login.
  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      // Sucesso → o status vira "authenticated" e o componente redireciona.
    } catch (err) {
      setError(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Não foi possível entrar. Verifique a conexão e tente novamente.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Group h="100vh" gap={0} wrap="nowrap" align="stretch">
      {/* Painel da marca — só no desktop. */}
      <Box
        visibleFrom="md"
        p={48}
        style={{
          flex: '0 0 42%',
          backgroundColor: 'var(--mantine-color-graphite-9)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <Logo variant="onDark" size={30} />
        <Box>
          <Title
            order={1}
            c="concreto.2"
            fz={40}
            lh={1.05}
            style={{ letterSpacing: '-0.02em' }}
          >
            A próxima obra
            <br />
            já está aberta.
          </Title>
          <Text c="concreto.5" fz="md" mt="md" maw={360}>
            Entre e veja quantas licitações de obra pública existem perto de você
            agora.
          </Text>
          <Stack gap="xs" mt={28}>
            {SELLING_POINTS.map((point) => (
              <Group key={point} gap="xs" wrap="nowrap">
                <IconCheck size={17} color="var(--mantine-color-orange-7)" stroke={2.6} />
                <Text c="concreto.3" fz="sm">
                  {point}
                </Text>
              </Group>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* Formulário de acesso. */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--mantine-color-concreto-2)',
        }}
        p="xl"
      >
        <Stack gap="lg" w="100%" maw={380}>
          <Box hiddenFrom="md">
            <Logo variant="onLight" size={28} />
          </Box>

          <Box>
            <Text
              span
              fz={12}
              fw={500}
              c="orange.8"
              style={{
                fontFamily: 'var(--mantine-font-family-monospace)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Acesso
            </Text>
            <Title order={2} fz={28} mt={6} style={{ letterSpacing: '-0.01em' }}>
              Bem-vindo, mestre.
            </Title>
            <Text c="dimmed" fz="sm" mt={4}>
              Ainda não tem conta?{' '}
              <Anchor component={Link} to="/cadastro" fw={600}>
                Criar conta grátis
              </Anchor>
            </Text>
          </Box>

          {error && (
            <Alert color="alerta" variant="light" icon={<IconAlertTriangle size={18} />}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="E-mail"
                type="email"
                placeholder="voce@empresa.com.br"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
                autoComplete="email"
                size="md"
              />
              <PasswordInput
                label="Senha"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                autoComplete="current-password"
                size="md"
              />
              <Button type="submit" fullWidth loading={submitting} mt="xs" size="md">
                Entrar
              </Button>
            </Stack>
          </form>
        </Stack>
      </Box>
    </Group>
  );
}
