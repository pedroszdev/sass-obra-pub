import {
  Alert,
  Anchor,
  Box,
  Button,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { forgotPassword } from '../lib/api';

export function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    try {
      await forgotPassword(email.trim());
    } catch {
      // De propósito: a resposta é a mesma em erro/sucesso (anti-enumeração).
    } finally {
      setEnviando(false);
      setEnviado(true);
    }
  }

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
      <Stack gap="lg" w="100%" maw={380}>
        <Logo variant="onLight" size={28} />

        {enviado ? (
          <Alert
            color="apto"
            variant="light"
            icon={<IconCircleCheck size={18} />}
            radius="md"
          >
            Se houver uma conta com esse e-mail, enviamos um link para redefinir a
            senha. O link vale 1 hora — confira também o spam.
          </Alert>
        ) : (
          <>
            <Box>
              <Title order={2} fz={26} style={{ letterSpacing: '-0.01em' }}>
                Esqueceu a senha?
              </Title>
              <Text c="dimmed" fz="sm" mt={4}>
                Informe seu e-mail e enviamos um link para você criar uma nova.
              </Text>
            </Box>
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
                <Button type="submit" fullWidth loading={enviando} size="md">
                  Enviar link
                </Button>
              </Stack>
            </form>
          </>
        )}

        <Text fz="sm" ta="center">
          <Anchor component={Link} to="/login" fw={600}>
            Voltar ao login
          </Anchor>
        </Text>
      </Stack>
    </Box>
  );
}
