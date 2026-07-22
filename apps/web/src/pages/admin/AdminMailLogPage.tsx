import {
  Alert,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  Pagination,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { getAdminMailLog } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { MailLogPagina } from '../../types/admin';

const COR: Record<string, string> = {
  enviado: 'green',
  falhou: 'red',
  log: 'gray',
};

// Log de e-mails transacionais (T-193). Nível de ENVIO (enviado/falhou/log) —
// entrega/bounce exigiria webhook do Resend (adiado).
export function AdminMailLogPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [pagina, setPagina] = useState<MailLogPagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPagina(
        await getAdminMailLog({
          email: email || undefined,
          status: status === 'todos' ? undefined : status,
          page,
        }),
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [email, status, page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalPaginas = pagina ? Math.ceil(pagina.total / pagina.pageSize) : 0;

  return (
    <Stack>
      <div>
        <Title order={2}>E-mails</Title>
        <Text c="dimmed">
          Log de envios transacionais. Status de ENVIO (entregue/bounce exigiria
          webhook do Resend). Reenvio de verificação: veja a conta (T-185).
        </Text>
      </div>

      <Card withBorder>
        <Group align="flex-end" gap="sm">
          <TextInput
            label="E-mail (destinatário)"
            placeholder="parte do e-mail"
            value={email}
            onChange={(e) => {
              setEmail(e.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1 }}
          />
          <SegmentedControl
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            data={[
              { value: 'todos', label: 'Todos' },
              { value: 'enviado', label: 'Enviado' },
              { value: 'falhou', label: 'Falhou' },
              { value: 'log', label: 'Log' },
            ]}
          />
        </Group>
      </Card>

      {erro ? (
        <Alert color="red" title="Falha">
          {erro}
        </Alert>
      ) : carregando && !pagina ? (
        <Center py="xl">
          <Loader color="orange" />
        </Center>
      ) : pagina && pagina.data.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          Nenhum e-mail no log para o filtro.
        </Text>
      ) : (
        pagina && (
          <>
            <Table.ScrollContainer minWidth={720}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Quando</Table.Th>
                    <Table.Th>Para</Table.Th>
                    <Table.Th>Assunto</Table.Th>
                    <Table.Th>Provedor</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pagina.data.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        {fmtDateTime(m.createdAt)}
                      </Table.Td>
                      <Table.Td>{m.para}</Table.Td>
                      <Table.Td>
                        <Text size="sm">{m.assunto}</Text>
                        {m.erro && (
                          <Text size="xs" c="red">
                            {m.erro}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>{m.provedor}</Table.Td>
                      <Table.Td>
                        <Badge color={COR[m.status] ?? 'gray'} variant="light">
                          {m.status}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>

            {totalPaginas > 1 && (
              <Group justify="center">
                <Pagination
                  total={totalPaginas}
                  value={page}
                  onChange={setPage}
                  color="orange"
                />
              </Group>
            )}
          </>
        )
      )}
    </Stack>
  );
}
