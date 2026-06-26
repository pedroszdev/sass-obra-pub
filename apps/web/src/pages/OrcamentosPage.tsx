import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type MouseEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { NovaPropostaModal } from '../components/NovaPropostaModal';
import {
  EmptyState,
  ErrorState,
  LoadingCards,
} from '../components/StateViews';
import { usePropostas } from '../hooks/usePropostas';
import { ApiError, deleteProposta } from '../lib/api';
import { brl, fmtDate } from '../lib/format';
import type { Proposta, PropostaStatus } from '../types/proposta';
import classes from '../styles/cards.module.css';

const STATUS: Record<PropostaStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'gray' },
  finalizada: { label: 'Finalizada', color: 'green' },
};

export function OrcamentosPage() {
  const { state, reload } = usePropostas();
  const [criando, setCriando] = useState(false);
  const [excluindo, setExcluindo] = useState<Proposta | null>(null);
  const [excluindoErro, setExcluindoErro] = useState<string | null>(null);
  const [excluindoLoading, setExcluindoLoading] = useState(false);

  function pedirExclusao(event: MouseEvent, proposta: Proposta) {
    // o card é um Link — não navegar ao clicar na lixeira
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

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={980} mx="auto">
        <Group justify="space-between" align="flex-start" mb="lg">
          <Box>
            <Title order={2} fz={18}>
              Seus orçamentos
            </Title>
            <Text fz={13} c="dimmed" mt={2}>
              Monte a planilha de preços de cada edital, com BDI, e exporte sua
              proposta.
            </Text>
          </Box>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCriando(true)}
          >
            Novo orçamento
          </Button>
        </Group>

        {state.status === 'loading' && <LoadingCards count={3} />}

        {state.status === 'error' && (
          <ErrorState
            title="Não foi possível carregar seus orçamentos."
            description={state.message}
            onRetry={reload}
          />
        )}

        {state.status === 'success' && state.data.length === 0 && (
          <EmptyState
            title="Você ainda não tem orçamentos."
            description="Crie um orçamento a partir de um edital salvo para montar sua proposta de preços."
            actionLabel="Novo orçamento"
            onAction={() => setCriando(true)}
          />
        )}

        {state.status === 'success' && state.data.length > 0 && (
          <Stack gap="sm">
            {state.data.map((p) => (
              <Card
                key={p.id}
                component={Link}
                to={`/orcamentos/${p.id}`}
                withBorder
                radius="md"
                p="lg"
                td="none"
                c="inherit"
                className={classes.hoverCard}
              >
                <Group
                  justify="space-between"
                  align="flex-start"
                  wrap="nowrap"
                  gap="xl"
                >
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Badge
                      color={STATUS[p.status].color}
                      variant="light"
                      radius="xl"
                      tt="none"
                      mb="xs"
                    >
                      {STATUS[p.status].label}
                    </Badge>
                    <Text
                      fz={15}
                      fw={600}
                      lineClamp={2}
                      style={{ lineHeight: 1.4 }}
                    >
                      {p.titulo}
                    </Text>
                    <Text fz={12.5} c="dimmed" mt={6}>
                      {p.bdiPercentual != null && `BDI ${p.bdiPercentual}% · `}
                      atualizado em {fmtDate(p.updatedAt)}
                    </Text>
                  </Box>
                  <Group gap="md" wrap="nowrap" align="flex-start">
                    <Box style={{ flex: 'none', textAlign: 'right' }}>
                      <Text
                        fz={10.5}
                        c="dimmed"
                        tt="uppercase"
                        style={{ letterSpacing: 0.4 }}
                      >
                        Valor de referência
                      </Text>
                      <Text fz={18} fw={700}>
                        {p.valorReferencia != null
                          ? brl(p.valorReferencia)
                          : '—'}
                      </Text>
                    </Box>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Excluir orçamento"
                      onClick={(e) => pedirExclusao(e, p)}
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
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
            <Button
              color="red"
              onClick={confirmarExclusao}
              loading={excluindoLoading}
            >
              Excluir
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
