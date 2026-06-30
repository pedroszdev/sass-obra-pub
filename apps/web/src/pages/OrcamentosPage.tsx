import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type MouseEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NovaPropostaModal } from '../components/NovaPropostaModal';
import { EmptyState, ErrorState, LoadingCards } from '../components/StateViews';
import { usePropostas } from '../hooks/usePropostas';
import { ApiError, deleteProposta } from '../lib/api';
import { brlCompact, fmtDate } from '../lib/format';
import type { Proposta, PropostaStatus } from '../types/proposta';

const STATUS: Record<PropostaStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'orange' },
  enviada: { label: 'Enviada', color: 'aco' },
  ganhou: { label: 'Ganhou', color: 'apto' },
  nao_ganhou: { label: 'Não ganhou', color: 'alerta' },
};

function OrcStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <Card withBorder radius="md" p="md">
      <Text fz={12} c="dimmed" mb={6}>
        {label}
      </Text>
      <Text fz={28} fw={800} c={color ? `${color}.8` : undefined} lh={1}>
        {value}
      </Text>
    </Card>
  );
}

export function OrcamentosPage() {
  const { state, reload } = usePropostas();
  const navigate = useNavigate();
  const [criando, setCriando] = useState(false);
  const [excluindo, setExcluindo] = useState<Proposta | null>(null);
  const [excluindoErro, setExcluindoErro] = useState<string | null>(null);
  const [excluindoLoading, setExcluindoLoading] = useState(false);

  function pedirExclusao(event: MouseEvent, proposta: Proposta) {
    // a linha navega ao clicar — não navegar ao clicar na lixeira
    event.preventDefault();
    event.stopPropagation();
    setExcluindoErro(null);
    setExcluindo(proposta);
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setExcluindoLoading(true);
    setExcluindoErro(null);
    try {
      await deleteProposta(excluindo.id);
      setExcluindo(null);
      reload();
    } catch (err) {
      setExcluindoErro(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Não foi possível excluir. Tente novamente.',
      );
    } finally {
      setExcluindoLoading(false);
    }
  }

  const propostas = state.status === 'success' ? state.data : [];
  const rascunhos = propostas.filter((p) => p.status === 'rascunho').length;
  const enviadas = propostas.filter((p) => p.status !== 'rascunho').length;
  const ganhas = propostas.filter((p) => p.status === 'ganhou').length;

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={1040} mx="auto">
        <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap">
          <Box>
            <Title order={1} fz={26} style={{ letterSpacing: '-0.01em' }}>
              Meus orçamentos
            </Title>
            <Text fz="sm" c="dimmed" mt={2}>
              Monte a planilha de preços de cada edital, com BDI, e exporte sua
              proposta.
            </Text>
          </Box>
          <Button
            color="orange"
            leftSection={<IconPlus size={16} />}
            onClick={() => setCriando(true)}
          >
            Novo orçamento
          </Button>
        </Group>

        {state.status === 'success' && propostas.length > 0 && (
          <SimpleGrid cols={{ base: 3 }} spacing="md" mb="lg">
            <OrcStat label="Rascunhos" value={rascunhos} color="orange" />
            <OrcStat label="Enviadas" value={enviadas} color="aco" />
            <OrcStat label="Ganhas" value={ganhas} color="apto" />
          </SimpleGrid>
        )}

        {state.status === 'loading' && <LoadingCards count={3} />}

        {state.status === 'error' && (
          <ErrorState
            title="Não foi possível carregar seus orçamentos."
            description={state.message}
            onRetry={reload}
          />
        )}

        {state.status === 'success' && propostas.length === 0 && (
          <EmptyState
            title="Você ainda não tem orçamentos."
            description="Crie um orçamento a partir de um edital salvo para montar sua proposta de preços."
            actionLabel="Novo orçamento"
            onAction={() => setCriando(true)}
          />
        )}

        {state.status === 'success' && propostas.length > 0 && (
          <Card withBorder radius="lg" p={0} style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={640}>
              <Table
                verticalSpacing="md"
                horizontalSpacing="lg"
                highlightOnHover
                styles={{
                  th: {
                    fontFamily: 'var(--mantine-font-family-monospace)',
                    textTransform: 'uppercase',
                    fontSize: '0.72rem',
                    letterSpacing: '0.06em',
                    fontWeight: 500,
                    color: 'var(--mantine-color-graphite-5)',
                  },
                }}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Obra</Table.Th>
                    <Table.Th>Valor de referência</Table.Th>
                    <Table.Th>BDI</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Atualizado</Table.Th>
                    <Table.Th aria-label="Ações" />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {propostas.map((p) => (
                    <Table.Tr
                      key={p.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/orcamentos/${p.id}`)}
                    >
                      <Table.Td>
                        <Text fz={14} fw={600} lineClamp={1}>
                          {p.titulo}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz={14} fw={700} ff="monospace">
                          {p.valorReferencia != null ? brlCompact(p.valorReferencia) : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz={13} ff="monospace" c="dimmed">
                          {p.bdiPercentual != null ? `${p.bdiPercentual}%` : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={STATUS[p.status].color}
                          variant="light"
                          radius="sm"
                          tt="none"
                        >
                          {STATUS[p.status].label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text fz={13} c="dimmed" ff="monospace">
                          {fmtDate(p.updatedAt)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label="Excluir orçamento"
                          onClick={(e) => pedirExclusao(e, p)}
                        >
                          <IconTrash size={17} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        )}
      </Box>

      <NovaPropostaModal
        opened={criando}
        onClose={() => setCriando(false)}
        onCreated={reload}
      />

      <Modal
        opened={excluindo !== null}
        onClose={() => setExcluindo(null)}
        title="Excluir orçamento"
        centered
        radius="md"
      >
        <Stack gap="md">
          <Text fz={14}>
            Tem certeza que deseja excluir{' '}
            <Text span fw={600}>
              {excluindo?.titulo}
            </Text>
            ? Os itens da proposta também serão removidos. Esta ação não pode ser
            desfeita.
          </Text>
          {excluindoErro && (
            <Text fz={13} c="red">
              {excluindoErro}
            </Text>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setExcluindo(null)}
              disabled={excluindoLoading}
            >
              Cancelar
            </Button>
            <Button color="red" onClick={confirmarExclusao} loading={excluindoLoading}>
              Excluir
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
