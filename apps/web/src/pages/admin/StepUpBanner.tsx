import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { confirmarStepUp, getStepUpStatus } from '../../lib/api';
import type { StepUpStatus } from '../../types/admin';

function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Banner de step-up do admin (T-183). As ações sensíveis (suspender conta,
// revogar sessões, cortesia, curadoria, reconciliar) exigem a senha reconfirmada
// há pouco. Aqui o dono destrava o "modo sudo" por ~10 min.
export function StepUpBanner() {
  const [status, setStatus] = useState<StepUpStatus | null>(null);
  const [aberto, { open, close }] = useDisclosure(false);
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function atualizar() {
    try {
      setStatus(await getStepUpStatus());
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    void atualizar();
    // Reavalia a cada minuto (a janela vence sozinha).
    const t = setInterval(() => void atualizar(), 60_000);
    return () => clearInterval(t);
  }, []);

  async function desbloquear() {
    setEnviando(true);
    setErro(null);
    try {
      setStatus(await confirmarStepUp(senha));
      setSenha('');
      close();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (!status) return null;

  return (
    <>
      {status.ativo ? (
        <Alert
          color="green"
          icon={<IconLockOpen size={16} />}
          py="xs"
          variant="light"
        >
          <Group justify="space-between">
            <Text size="sm">
              Ações sensíveis liberadas
              {status.expiraEm ? ` até ${horaLocal(status.expiraEm)}` : ''}.
            </Text>
            <Badge color="green" variant="light">
              sudo
            </Badge>
          </Group>
        </Alert>
      ) : (
        <Alert color="yellow" icon={<IconLock size={16} />} py="xs" variant="light">
          <Group justify="space-between">
            <Text size="sm">
              Ações sensíveis bloqueadas. Reconfirme sua senha para liberar.
            </Text>
            <Button size="xs" variant="light" onClick={open}>
              Desbloquear
            </Button>
          </Group>
        </Alert>
      )}

      <Modal
        opened={aberto}
        onClose={close}
        title="Reconfirmar senha"
        centered
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Para liberar as ações sensíveis do admin, digite sua senha. Vale por
            ~10 minutos.
          </Text>
          {erro && <Alert color="red">{erro}</Alert>}
          <PasswordInput
            label="Senha"
            value={senha}
            onChange={(e) => setSenha(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && senha) void desbloquear();
            }}
            autoFocus
          />
          <Group justify="flex-end">
            <Button
              onClick={desbloquear}
              loading={enviando}
              disabled={senha.length === 0}
            >
              Liberar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
