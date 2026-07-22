import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Pagination,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconExternalLink, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminAssinaturas,
  getAdminMrr,
  getAdminWebhooks,
  reconciliarAssinatura,
} from '../../lib/api';
import { fmtDate, fmtDateTime } from '../../lib/format';
import type {
  AssinaturaStatus,
  AssinaturasBillingPagina,
  Mrr,
  WebhooksPagina,
} from '../../types/admin';
import { corDoStatus, rotuloStatus, stripeCustomerUrl } from './assinatura-status';

function brlDeCentavos(c: number, moeda: string): string {
  const v = c / 100;
  return moeda.toLowerCase() === 'brl'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : `${v.toFixed(2)} ${moeda.toUpperCase()}`;
}

export function AdminBillingPage() {
  const [mrr, setMrr] = useState<Mrr | null>(null);
  const [status, setStatus] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [pagina, setPagina] = useState<AssinaturasBillingPagina | null>(null);
  const [webhooks, setWebhooks] = useState<WebhooksPagina | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [reconc, setReconc] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [assn, wh] = await Promise.all([
        getAdminAssinaturas({
          status: status === 'todos' ? undefined : (status as AssinaturaStatus),
          page,
        }),
        getAdminWebhooks(1),
      ]);
      setPagina(assn);
      setWebhooks(wh);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [status, page]);

  useEffect(() => {
    void carregar();
    getAdminMrr()
      .then(setMrr)
      .catch(() => setMrr(null));
  }, [carregar]);

  async function reconciliar(userId: string) {
    setReconc(userId);
    setAviso(null);
    try {
      const r = await reconciliarAssinatura(userId);
      setAviso(
        r.semStripe
          ? 'Sem assinatura na Stripe para reconciliar.'
          : r.corrigida
            ? 'Reconciliado: havia divergência, foi corrigida.'
            : 'Reconciliado: já estava em dia.',
      );
      await carregar();
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setReconc(null);
    }
  }

  const totalPaginas = pagina ? Math.ceil(pagina.total / pagina.pageSize) : 0;

  return (
    <Stack>
      <div>
        <Title order={2}>Assinaturas</Title>
        <Text c="dimmed">
          Espelho das assinaturas + eventos de webhook. "Reconciliar" re-lê a
          Stripe e corrige (recupera webhook perdido, sem mexer no banco).
        </Text>
      </div>

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Card withBorder padding="md">
          <Text size="28px" fw={700}>
            {mrr ? brlDeCentavos(mrr.mrrCentavos, mrr.moeda) : '—'}
          </Text>
          <Text size="sm" c="dimmed">
            MRR simples
          </Text>
          {mrr ? (
            <Text size="xs" c="dimmed">
              {mrr.ativosMensal} mensais · {mrr.ativosAnual} anuais
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              preço indisponível (Stripe)
            </Text>
          )}
        </Card>
      </SimpleGrid>

      {aviso && <Alert color="blue">{aviso}</Alert>}
      {erro && (
        <Alert color="red" title="Falha">
          {erro}
        </Alert>
      )}

      <SegmentedControl
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        data={[
          { value: 'todos', label: 'Todas' },
          { value: 'trialing', label: 'Em teste' },
          { value: 'active', label: 'Ativas' },
          { value: 'past_due', label: 'Pendentes' },
          { value: 'canceled', label: 'Canceladas' },
        ]}
      />

      {!pagina ? (
        <Center py="xl">
          <Loader color="orange" />
        </Center>
      ) : pagina.data.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          Nenhuma assinatura para o filtro.
        </Text>
      ) : (
        <>
          <Table.ScrollContainer minWidth={760}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Conta</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Plano</Table.Th>
                  <Table.Th>Renova/expira</Table.Th>
                  <Table.Th>Stripe</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pagina.data.map((a) => (
                  <Table.Tr key={a.userId}>
                    <Table.Td>
                      <Anchor component={Link} to={`/admin/contas/${a.userId}`} size="sm">
                        {a.email}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Badge color={corDoStatus(a.status)} variant="light">
                          {rotuloStatus(a.status)}
                        </Badge>
                        {a.cancelAtPeriodEnd && (
                          <Badge color="gray" variant="light" size="xs">
                            cancela no fim
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>{a.plano}</Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {a.currentPeriodEnd
                        ? fmtDate(a.currentPeriodEnd)
                        : a.trialEndsAt
                          ? `teste até ${fmtDate(a.trialEndsAt)}`
                          : '—'}
                    </Table.Td>
                    <Table.Td>
                      {a.stripeCustomerId ? (
                        <Anchor
                          href={stripeCustomerUrl(a.stripeCustomerId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="xs"
                        >
                          <Group gap={2}>
                            abrir
                            <IconExternalLink size={12} />
                          </Group>
                        </Anchor>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconRefresh size={13} />}
                        loading={reconc === a.userId}
                        onClick={() => reconciliar(a.userId)}
                      >
                        Reconciliar
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          {totalPaginas > 1 && (
            <Group justify="center">
              <Pagination total={totalPaginas} value={page} onChange={setPage} color="orange" />
            </Group>
          )}
        </>
      )}

      <Card withBorder>
        <Title order={4} mb="sm">
          Webhooks recebidos (processados)
        </Title>
        <Text size="xs" c="dimmed" mb="sm">
          Só os eventos aplicados com sucesso. Falhas não ficam registradas (são
          apagadas para a Stripe reentregar) — a recuperação é "Reconciliar".
        </Text>
        {!webhooks || webhooks.data.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nenhum evento registrado.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Gerado na Stripe</Table.Th>
                  <Table.Th>Processado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {webhooks.data.map((e) => (
                  <Table.Tr key={e.id}>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {e.tipo}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {fmtDateTime(e.criadoEmStripe)}
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {fmtDateTime(e.processadoEm)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}
