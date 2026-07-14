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
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
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
  const { status, user, login } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // O login com Google acontece por redirect (T-126b): quando ele falha, quem
  // manda o usuário de volta pra cá é a API, com ?erro=google — não há promise
  // no JS pra capturar o erro, então ele chega pela URL.
  const [error, setError] = useState<string | null>(
    searchParams.get('erro') === 'google'
      ? 'Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.'
      : null,
  );
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
      {/* Mesma centralização do cadastro (margin auto, não align-items): o form
          daqui é curto e cabe, mas em tela baixa (celular deitado) o topo sumiria
          do mesmo jeito. Ver a explicação em RegisterPage. */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          backgroundColor: 'var(--mantine-color-concreto-2)',
          overflowY: 'auto',
        }}
        p="xl"
      >
        <Stack gap={28} w="100%" maw={400} py="xl" style={{ margin: 'auto' }}>
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
              <GoogleButton modo="redirect" text="continue_with" />
              {/* Continuar com o Google também CRIA a conta, se não houver uma —
                  por isso o aceite (T-102) é avisado aqui, não só no cadastro. */}
              <Text fz="xs" c="dimmed" ta="center" mt={-16}>
                Ao continuar com o Google você concorda com os{' '}
                <Anchor component={Link} to="/termos" target="_blank" fz="xs" fw={600}>
                  Termos de uso
                </Anchor>{' '}
                e a{' '}
                <Anchor
                  component={Link}
                  to="/privacidade"
                  target="_blank"
                  fz="xs"
                  fw={600}
                >
                  Política de privacidade
                </Anchor>
                .
              </Text>
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
