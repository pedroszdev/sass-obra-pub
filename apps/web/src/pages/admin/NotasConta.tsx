import {
  ActionIcon,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import {
  addAccountNote,
  deleteAccountNote,
  getAccountNotes,
} from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { AccountNote } from '../../types/admin';

// Notas internas por conta (T-186) — o mini-CRM do beta.
export function NotasConta({ userId }: { userId: string }) {
  const [notas, setNotas] = useState<AccountNote[]>([]);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    getAccountNotes(userId)
      .then((n) => ativo && setNotas(n))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [userId]);

  async function adicionar() {
    setSalvando(true);
    try {
      setNotas(await addAccountNote(userId, texto.trim()));
      setTexto('');
    } catch {
      // silencioso: o campo mantém o texto para tentar de novo
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    setRemovendo(id);
    try {
      setNotas(await deleteAccountNote(userId, id));
    } catch {
      // ignora
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <Card withBorder>
      <Title order={4} mb="sm">
        Notas internas
      </Title>
      <Stack gap="sm">
        <Group align="flex-end" gap="sm">
          <Textarea
            placeholder="Ex.: liguei 12/08, pediu filtro por região…"
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            autosize
            minRows={1}
            style={{ flex: 1 }}
            maxLength={2000}
          />
          <Button
            onClick={adicionar}
            loading={salvando}
            disabled={texto.trim().length === 0}
          >
            Adicionar
          </Button>
        </Group>

        {notas.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nenhuma nota ainda.
          </Text>
        ) : (
          notas.map((n) => (
            <Group key={n.id} justify="space-between" align="flex-start" wrap="nowrap">
              <div style={{ flex: 1 }}>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {n.texto}
                </Text>
                <Text size="xs" c="dimmed">
                  {fmtDateTime(n.createdAt)}
                </Text>
              </div>
              <ActionIcon
                variant="subtle"
                color="red"
                loading={removendo === n.id}
                onClick={() => remover(n.id)}
                aria-label="Remover nota"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))
        )}
      </Stack>
    </Card>
  );
}
