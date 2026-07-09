import {
  Alert,
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AuthBrandPanel } from '../components/AuthBrandPanel';
import { GoogleButton } from '../components/GoogleButton';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/auth-context';
import { ApiError } from '../lib/api';
import { googleClientId } from '../lib/google';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { status, user, login, loginGoogle } = useAuth();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Já autenticado (ou recém-logado): sai da tela de login. Conta sem UF (criada
  // pelo Google, T-126) vai ao onboarding — sem região a captação não roda.
  if (status === 'authenticated') {
    return <Navigate to={user && !user.uf ? '/onboarding' : from} replace />;
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

  // Entrar com Google (T-126). Esta tela é só de LOGIN: se o Google trouxer uma
  // pessoa sem conta, o backend recusa por falta do aceite dos termos (400) e nós
  // a mandamos ao cadastro, onde o consentimento é coletado (T-102).
  async function handleGoogle(idToken: string) {
    setError(null);
    setSubmitting(true);
    try {
      await loginGoogle(idToken);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(
          'Você ainda não tem conta com esse Google. Use "Criar conta" para se cadastrar.',
        );
      } else {
        setError(
          err instanceof ApiError && err.status !== 0
            ? err.message
            : 'Não foi possível entrar com o Google. Tente novamente.',
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <Group h="100vh" gap={0} wrap="nowrap" align="stretch">
      <AuthBrandPanel
        titulo={
          <>
            A próxima obra
            <br />
            já está aberta.
          </>
        }
      />

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
        <Stack gap={28} w="100%" maw={400}>
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
            <Title order={2} fz={30} mt={6} style={{ letterSpacing: '-0.02em' }}>
              Bem-vindo de volta.
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

          {/* Login social primeiro (T-126): é o caminho de menor atrito. Some
              sozinho se o client id do Google não estiver configurado — não
              oferecemos o que não funciona. */}
          {googleClientId() && (
            <>
              <GoogleButton onCredential={handleGoogle} text="continue_with" />
              <Divider
                label="ou com e-mail"
                labelPosition="center"
                styles={{
                  label: {
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontSize: 12,
                    fontWeight: 600,
                  },
                }}
              />
            </>
          )}

          <form onSubmit={handleSubmit}>
            <Stack gap={18}>
              <TextInput
                label="E-mail"
                type="email"
                placeholder="voce@empresa.com.br"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
                withAsterisk={false}
                autoComplete="email"
                size="md"
              />
              <PasswordInput
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                // Sem asterisco: o rótulo customizado ocupa 100% da largura e o
                // asterisco do Mantine quebraria para a linha de baixo.
                withAsterisk={false}
                autoComplete="current-password"
                size="md"
                labelProps={{ style: { width: '100%' } }}
                label={
                  <Group justify="space-between" align="baseline" w="100%">
                    <Text span fz="sm" fw={600}>
                      Senha
                    </Text>
                    <Anchor component={Link} to="/esqueci-senha" fz={13} fw={500}>
                      Esqueci minha senha
                    </Anchor>
                  </Group>
                }
              />
              <Button type="submit" fullWidth loading={submitting} mt={4} size="md">
                Entrar
              </Button>
            </Stack>
          </form>

          <Text fz={13} c="dimmed" ta="center">
            Conexão segura · Seus dados não são compartilhados
          </Text>
        </Stack>
      </Box>
    </Group>
  );
}
