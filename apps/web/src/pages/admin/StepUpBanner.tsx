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
import { GoogleButton } from '../../components/GoogleButton';
import { useAuth } from '../../context/auth-context';
import {
  confirmarStepUp,
  confirmarStepUpGoogle,
  getStepUpStatus,
} from '../../lib/api';
import type { StepUpStatus } from '../../types/admin';

// Banner de step-up do admin (T-183). As ações sensíveis (suspender conta,
// revogar sessões, cortesia, curadoria, reconciliar) exigem a identidade
// reconfirmada. Step-up POR SESSÃO (decisão do dono): desbloqueia uma vez e vale
// até deslogar. Conta só-Google reconfirma pelo Google (sem senha).
export function StepUpBanner() {
  const { user } = useAuth();
  // Conta admin criada pelo Google (T-126) não tem senha para reconfirmar — o
  // caminho dela é a re-autenticação pelo Google (mesma ideia da exclusão).
  const soGoogle = user != null && !user.temSenha;
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

  // O clique no botão do Google já É a confirmação — o id_token fresco reautentica
  // e abre a janela. Só volta (mostra erro) se falhar.
  async function desbloquearComGoogle(idToken: string) {
    setEnviando(true);
    setErro(null);
    try {
      setStatus(await confirmarStepUpGoogle(idToken));
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
            <Text size="sm">Ações sensíveis liberadas nesta sessão.</Text>
            <Badge color="green" variant="light">
              sudo
            </Badge>
          </Group>
        </Alert>
      ) : (
        <Alert color="yellow" icon={<IconLock size={16} />} py="xs" variant="light">
          <Group justify="space-between">
            <Text size="sm">
              Ações sensíveis bloqueadas.{' '}
              {soGoogle
                ? 'Reconfirme sua identidade pelo Google para liberar.'
                : 'Reconfirme sua senha para liberar.'}
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
        title={soGoogle ? 'Reconfirmar identidade' : 'Reconfirmar senha'}
        centered
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Para liberar as ações sensíveis do admin,{' '}
            {soGoogle
              ? 'reconfirme sua identidade com o Google'
              : 'digite sua senha'}
            . Você faz isso uma vez — vale até deslogar.
          </Text>
          {erro && <Alert color="red">{erro}</Alert>}
          {soGoogle ? (
            // Conta só-Google: o clique no botão do Google já reautentica e libera.
            <GoogleButton
              modo="popup"
              onCredential={(idToken) => void desbloquearComGoogle(idToken)}
            />
          ) : (
            <>
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
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
