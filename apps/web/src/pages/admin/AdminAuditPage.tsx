import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Code,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { getAuditLog } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { AdminAuditPage as AuditPage } from '../../types/admin';

const PAGE_SIZE = 20;

// Consulta da trilha de auditoria (T-182): filtro por período e ação, paginado.
// Read-only — a gravação é automática, feita pelo interceptor do backend.
export function AdminAuditPage() {
  const [desde, setDesde] = useState('');
  const [ate, setAte] = useState('');
  const [acao, setAcao] = useState('');
  const [page, setPage] = useState(1);

  const [pagina, setPagina] = useState<AuditPage | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await getAuditLog({
        desde: desde || undefined,
        ate: ate || undefined,
        acao: acao || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setPagina(r);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [desde, ate, acao, page]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  const aplicarFiltro = () => {
    // Volta à página 1 ao filtrar; o efeito refaz a busca.
    setPage(1);
  };

  const totalPaginas = pagina ? Math.ceil(pagina.total / pagina.pageSize) : 0;

  return (
    <Stack>
      <div>
        <Title order={2}>Auditoria</Title>
        <Text c="dimmed">
          Registro de toda ação administrativa (mutações e acesso a dados de
          conta). Filtre por período e por ação.
        </Text>
      </div>

      <Card withBorder>
        <Group align="flex-end" gap="sm">
          <TextInput
            label="De"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.currentTarget.value)}
          />
          <TextInput
            label="Até"
            type="date"
            value={ate}
            onChange={(e) => setAte(e.currentTarget.value)}
          />
          <TextInput
            label="Ação"
            placeholder="ex.: trial.extend"
            value={acao}
            onChange={(e) => setAcao(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={aplicarFiltro}
            loading={carregando}
          >
            Filtrar
          </Button>
        </Group>
      </Card>

      {erro ? (
        <Alert color="red" title="Falha ao carregar a auditoria">
          {erro}
        </Alert>
      ) : carregando && !pagina ? (
        <Center py="xl">
          <Loader color="orange" />
        </Center>
      ) : pagina && pagina.data.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          Nenhum registro para o filtro.
        </Text>
      ) : (
        pagina && (
          <>
            <Table.ScrollContainer minWidth={720}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Quando</Table.Th>
                    <Table.Th>Ação</Table.Th>
                    <Table.Th>Rota</Table.Th>
                    <Table.Th>Alvo</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>IP</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pagina.data.map((e) => (
                    <Table.Tr key={e.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        {fmtDateTime(e.createdAt)}
                      </Table.Td>
                      <Table.Td>
                        <Code>{e.action}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {e.method} {e.path}
                        </Text>
                      </Table.Td>
                      <Table.Td>{e.targetId ?? '—'}</Table.Td>
                      <Table.Td>
                        <Badge
                          color={e.statusCode < 400 ? 'green' : 'red'}
                          variant="light"
                        >
                          {e.statusCode}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{e.ip ?? '—'}</Table.Td>
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
