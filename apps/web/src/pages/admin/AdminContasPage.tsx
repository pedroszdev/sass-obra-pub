import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminContas } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import type { AccountsPage, AssinaturaStatus } from '../../types/admin';
import { corDoStatus, rotuloStatus } from './assinatura-status';

const PAGE_SIZE = 20;

const STATUS_OPCOES = [
  { value: 'trialing', label: 'Em teste' },
  { value: 'active', label: 'Ativa' },
  { value: 'past_due', label: 'Pagamento pendente' },
  { value: 'canceled', label: 'Cancelada' },
];

// Lista de contas do beta (T-184). Filtro por e-mail, CNPJ, status e verificação;
// clique na linha abre o detalhe.
export function AdminContasPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [pagina, setPagina] = useState<AccountsPage | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await getAdminContas({
        email: email || undefined,
        cnpj: cnpj || undefined,
        status: (status as AssinaturaStatus) || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setPagina(r);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [email, cnpj, status, page]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  const totalPaginas = pagina ? Math.ceil(pagina.total / pagina.pageSize) : 0;

  return (
    <Stack>
      <div>
        <Title order={2}>Contas</Title>
        <Text c="dimmed">Contas cadastradas no beta. Clique para ver o detalhe.</Text>
      </div>

      <Card withBorder>
        <Group align="flex-end" gap="sm">
          <TextInput
            label="E-mail"
            placeholder="parte do e-mail"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <TextInput
            label="CNPJ"
            placeholder="só dígitos"
            value={cnpj}
            onChange={(e) => setCnpj(e.currentTarget.value)}
          />
          <Select
            label="Status"
            placeholder="qualquer"
            clearable
            data={STATUS_OPCOES}
            value={status}
            onChange={setStatus}
          />
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={() => setPage(1)}
            loading={carregando}
          >
            Filtrar
          </Button>
        </Group>
      </Card>

      {erro ? (
        <Alert color="red" title="Falha ao carregar as contas">
          {erro}
        </Alert>
      ) : carregando && !pagina ? (
        <Center py="xl">
          <Loader color="orange" />
        </Center>
      ) : pagina && pagina.data.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          Nenhuma conta para o filtro.
        </Text>
      ) : (
        pagina && (
          <>
            <Table.ScrollContainer minWidth={720}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>E-mail</Table.Th>
                    <Table.Th>CNPJ</Table.Th>
                    <Table.Th>Assinatura</Table.Th>
                    <Table.Th>E-mail verif.</Table.Th>
                    <Table.Th>Cadastro</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pagina.data.map((c) => (
                    <Table.Tr
                      key={c.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/admin/contas/${c.id}`)}
                    >
                      <Table.Td>
                        <Text size="sm">{c.email}</Text>
                        <Text size="xs" c="dimmed">
                          {c.name}
                        </Text>
                      </Table.Td>
                      <Table.Td>{c.cnpj ?? '—'}</Table.Td>
                      <Table.Td>
                        {c.assinatura ? (
                          <Badge color={corDoStatus(c.assinatura.status)} variant="light">
                            {rotuloStatus(c.assinatura.status)}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </Table.Td>
                      <Table.Td>
                        {c.emailVerificado ? (
                          <Badge color="green" variant="light">
                            sim
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light">
                            não
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(c.createdAt)}
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
