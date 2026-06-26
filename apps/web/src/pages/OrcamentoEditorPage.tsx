import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
} from '@mantine/core';
import { IconArrowLeft, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingCards } from '../components/StateViews';
import { ApiError, getProposta } from '../lib/api';
import { brl, fmtDate } from '../lib/format';
import type { PropostaDetail, PropostaStatus } from '../types/proposta';

const STATUS: Record<PropostaStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'gray' },
  finalizada: { label: 'Finalizada', color: 'green' },
};

type State =
  | { status: 'loading' }
  | { status: 'success'; data: PropostaDetail }
  | { status: 'notfound' }
  | { status: 'error'; message: string };

export function OrcamentoEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    getProposta(id, controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'notfound' });
          return;
        }
        setState({
          status: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Não foi possível carregar o orçamento.',
        });
      });
    return () => controller.abort();
  }, [id, nonce]);

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={980} mx="auto">
        <Button
          component={Link}
          to="/orcamentos"
          variant="subtle"
          color="orange"
          size="compact-sm"
          px={0}
          leftSection={<IconArrowLeft size={16} />}
          mb="sm"
        >
          Voltar para orçamentos
        </Button>

        {state.status === 'loading' && <LoadingCards count={1} />}

        {state.status === 'notfound' && (
          <EmptyState
            title="Orçamento não encontrado."
            actionLabel="Voltar para orçamentos"
            onAction={() => navigate('/orcamentos')}
          />
        )}

        {state.status === 'error' && (
          <ErrorState
            title="Não foi possível carregar o orçamento."
            description={state.message}
            onRetry={() => setNonce((n) => n + 1)}
          />
        )}

        {state.status === 'success' && (
          <Stack gap="sm">
            <Card withBorder radius="lg" p="xl">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Badge
                    color={STATUS[state.data.status].color}
                    variant="light"
                    radius="xl"
                    tt="none"
                    mb="xs"
                  >
                    {STATUS[state.data.status].label}
                  </Badge>
                  <Text fz={17} fw={700} style={{ lineHeight: 1.35 }}>
                    {state.data.titulo}
                  </Text>
                  <Text fz={13} c="dimmed" mt={4}>
                    Valor de referência: {brl(state.data.valorReferencia)}
                    {state.data.bdiPercentual != null &&
                      ` · BDI ${state.data.bdiPercentual}%`}{' '}
                    · atualizado em {fmtDate(state.data.updatedAt)}
                  </Text>
                </Box>
              </Group>
              <Button
                component={Link}
                to={`/editais/${state.data.editalId}`}
                variant="light"
                color="orange"
                size="compact-sm"
                mt="md"
              >
                Ver edital de origem
              </Button>
            </Card>

            <Alert
              icon={<IconInfoCircle size={18} />}
              color="orange"
              variant="light"
              radius="lg"
              title="Edição da planilha em breve"
            >
              A planilha de itens, o preenchimento de preços, o cálculo de
              totais e o BDI chegam na próxima etapa. Por enquanto você já pode
              criar e organizar seus orçamentos por edital.
            </Alert>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
