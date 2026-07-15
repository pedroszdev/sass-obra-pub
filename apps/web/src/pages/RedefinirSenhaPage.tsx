import {
  Alert,
  Anchor,
  Box,
  Button,
  PasswordInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { SenhaRequisitos } from '../components/SenhaRequisitos';
import { ApiError, resetPassword } from '../lib/api';
import { senhaForte } from '../lib/senha';

export function RedefinirSenhaPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!senhaForte(senha)) {
      setErro('A senha não atende aos requisitos indicados.');
      return;
    }
    if (senha !== confirma) {
      setErro('A confirmação não bate com a nova senha.');
      return;
    }
    setSalvando(true);
    try {
      await resetPassword(token, senha);
      setOk(true);
    } catch (e) {
      setErro(
        e instanceof ApiError && e.status !== 0
          ? e.message
          : 'Não foi possível redefinir agora. Tente de novo.',
      );
      setSalvando(false);
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

        {!token ? (
          <Alert
            color="alerta"
            variant="light"
            icon={<IconAlertTriangle size={18} />}
            radius="md"
          >
            Link inválido. Peça um novo em “Esqueci a senha”.
          </Alert>
        ) : ok ? (
          <Alert
            color="apto"
            variant="light"
            icon={<IconCircleCheck size={18} />}
            radius="md"
          >
            Senha redefinida! As outras sessões foram encerradas. Já pode entrar
            com a nova senha.
          </Alert>
        ) : (
          <>
            <Box>
              <Title order={2} fz={26} style={{ letterSpacing: '-0.01em' }}>
                Nova senha
              </Title>
              <Text c="dimmed" fz="sm" mt={4}>
                Escolha uma nova senha para a sua conta.
              </Text>
            </Box>
            {erro && (
              <Alert color="alerta" variant="light" radius="md">
                {erro}
              </Alert>
            )}
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <Box>
                  <PasswordInput
                    label="Nova senha"
                    placeholder="Crie uma senha forte"
                    value={senha}
                    onChange={(e) => setSenha(e.currentTarget.value)}
                    autoComplete="new-password"
                    size="md"
                  />
                  <SenhaRequisitos senha={senha} />
                </Box>
                <PasswordInput
                  label="Confirmar nova senha"
                  placeholder="Repita a nova senha"
                  value={confirma}
                  onChange={(e) => setConfirma(e.currentTarget.value)}
                  autoComplete="new-password"
                  size="md"
                />
                <Button type="submit" fullWidth loading={salvando} size="md">
                  Redefinir senha
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
