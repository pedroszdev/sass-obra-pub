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
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { TurnstileWidget } from '../components/TurnstileWidget';
import { ApiError, forgotPassword } from '../lib/api';
import { turnstileSiteKey } from '../lib/turnstile';

export function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Turnstile (T-203): esta é a única rota pública restante que dispara e-mail.
  const turnstileAtivo = turnstileSiteKey() !== undefined;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (turnstileAtivo && !turnstileToken) {
      setErro('Aguarde a verificação de segurança terminar e tente de novo.');
      return;
    }
    setEnviando(true);
    try {
      await forgotPassword(email.trim(), turnstileToken ?? undefined);
      setEnviado(true);
    } catch (err) {
      // ⚠️ A anti-enumeração continua valendo: a API responde 204 tanto para
      // e-mail existente quanto inexistente, então NENHUM erro daqui é sinal de
      // conta. Por isso qualquer falha (rede, 5xx) segue mostrando o sucesso —
      // era o comportamento original, e é ele que impede o oráculo.
      //
      // O 400 é a exceção, e não vaza nada: só sai do Turnstile (token ausente,
      // expirado ou reusado) ou de e-mail malformado — os dois independem de a
      // conta existir. Mostrar sucesso aqui seria MENTIR: o usuário esperaria um
      // e-mail que nunca foi enviado. Então avisa e reseta o widget.
      if (err instanceof ApiError && err.status === 400) {
        setErro(
          'Não foi possível confirmar que você não é um robô. Tente de novo.',
        );
        setTurnstileToken(null);
        setTurnstileReset((n) => n + 1);
      } else {
        setEnviado(true);
      }
    } finally {
      setEnviando(false);
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
            {erro && (
              <Alert
                color="alerta"
                variant="light"
                icon={<IconAlertTriangle size={18} />}
                radius="md"
              >
                {erro}
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
                {/* `action` casa com o @Turnstile('forgot_password') da rota. */}
                <TurnstileWidget
                  action="forgot_password"
                  onToken={setTurnstileToken}
                  resetSinal={turnstileReset}
                />
                <Button
                  type="submit"
                  fullWidth
                  loading={enviando}
                  disabled={turnstileAtivo && !turnstileToken}
                  size="md"
                >
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
