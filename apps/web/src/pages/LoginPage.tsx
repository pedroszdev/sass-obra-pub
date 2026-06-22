import {
  Alert,
  Box,
  Button,
  Card,
  Center,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { ApiError } from '../lib/api';

interface LocationState {
  from?: { pathname: string };
}

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
    <Center mih="100vh" bg="gray.0" p="md">
      <Card withBorder radius="lg" p="xl" w={400} maw="100%">
        <Stack gap="lg">
          <Group gap="sm">
            <Box
              w={36}
              h={36}
              bg="orange.8"
              style={{
                borderRadius: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text c="white" fw={800} fz={15}>
                OP
              </Text>
            </Box>
            <Box style={{ lineHeight: 1.15 }}>
              <Text fw={700}>ObraPública</Text>
              <Text fz={11} c="dimmed">
                Editais &amp; propostas
              </Text>
            </Box>
          </Group>

          <Box>
            <Title order={2} fz={22}>
              Entrar
            </Title>
            <Text c="dimmed" fz="sm" mt={4}>
              Acesse para buscar editais de obra pública na sua região.
            </Text>
          </Box>

          {error && (
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={18} />}
            >
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
              />
              <PasswordInput
                label="Senha"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                autoComplete="current-password"
              />
              <Button type="submit" fullWidth loading={submitting} mt="xs">
                Entrar
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Center>
  );
}
