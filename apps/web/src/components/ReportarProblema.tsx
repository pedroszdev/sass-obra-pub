import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBug, IconCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { reportarProblema } from '../lib/api';

// Versão do build, se o Vite injetar (senão fica indefinida — o backend aceita).
const VERSAO = import.meta.env.VITE_APP_VERSION as string | undefined;

// Botão + modal de "Reportar problema" (T-202). Fica no header do app; captura a
// rota atual como contexto. É assim que um bug do beta chega ao dono em horas.
export function ReportarProblema() {
  const [aberto, { open, close }] = useDisclosure(false);
  const { pathname } = useLocation();
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function fechar() {
    close();
    // Reseta depois da animação de fechar.
    setTimeout(() => {
      setMensagem('');
      setEnviado(false);
      setErro(null);
    }, 200);
  }

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      await reportarProblema({
        mensagem: mensagem.trim(),
        rota: pathname,
        versao: VERSAO,
      });
      setEnviado(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Tooltip label="Reportar problema">
        <ActionIcon
          onClick={open}
          variant="subtle"
          color="gray"
          radius="xl"
          size="lg"
          aria-label="Reportar problema"
        >
          <IconBug size={19} stroke={1.7} />
        </ActionIcon>
      </Tooltip>

      <Modal opened={aberto} onClose={fechar} title="Reportar problema" centered>
        {enviado ? (
          <Stack align="center" py="md">
            <IconCheck size={40} color="var(--mantine-color-green-6)" />
            <Text ta="center">
              Recebemos seu reporte. Obrigado — vamos olhar!
            </Text>
            <Button onClick={fechar}>Fechar</Button>
          </Stack>
        ) : (
          <Stack>
            <Text size="sm" c="dimmed">
              Conte o que aconteceu. Enviamos junto a tela em que você está para
              ajudar a encontrar o problema.
            </Text>
            {erro && <Alert color="red">{erro}</Alert>}
            <Textarea
              placeholder="Ex.: ao salvar o orçamento a tela travou…"
              autosize
              minRows={4}
              value={mensagem}
              onChange={(e) => setMensagem(e.currentTarget.value)}
              maxLength={2000}
            />
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Tela: {pathname}
              </Text>
              <Button
                onClick={enviar}
                loading={enviando}
                disabled={mensagem.trim().length < 3}
              >
                Enviar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
