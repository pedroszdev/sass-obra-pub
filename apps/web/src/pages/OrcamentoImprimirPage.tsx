import { Box, Button, Group, Table, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconPrinter } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ErrorState, LoadingCards } from '../components/StateViews';
import { ApiError, getProposta } from '../lib/api';
import { brl, fmtDate } from '../lib/format';
import type { PropostaDetail } from '../types/proposta';

type State =
  | { status: 'loading' }
  | { status: 'success'; data: PropostaDetail }
  | { status: 'error'; message: string };

// Versão limpa, sem o shell, para impressão / "Salvar como PDF" (T-70). Renderiza
// os totais do backend (§3.3). A barra de ações some na impressão (.no-print).
export function OrcamentoImprimirPage() {
  const { id } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    getProposta(id, controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError ? err.message : 'Não foi possível carregar.',
        });
      });
    return () => controller.abort();
  }, [id]);

  return (
    <Box style={{ minHeight: '100vh', background: '#fff' }}>
      <Group
        className="no-print"
        justify="space-between"
        px="lg"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
      >
        <Button
          component={Link}
          to={id ? `/orcamentos/${id}` : '/orcamentos'}
          variant="subtle"
          color="orange"
          size="compact-sm"
          leftSection={<IconArrowLeft size={16} />}
        >
          Voltar ao orçamento
        </Button>
        <Button
          color="orange"
          leftSection={<IconPrinter size={16} />}
          onClick={() => window.print()}
          disabled={state.status !== 'success'}
        >
          Imprimir / Salvar PDF
        </Button>
      </Group>

      <Box maw={820} mx="auto" px="lg" py="xl">
        {state.status === 'loading' && <LoadingCards count={1} />}
        {state.status === 'error' && (
          <ErrorState title="Não foi possível carregar." description={state.message} />
        )}
        {state.status === 'success' && <Documento data={state.data} />}
      </Box>
    </Box>
  );
}

function Documento({ data }: { data: PropostaDetail }) {
  const c = data.calculo;
  const comp = c.comparacao;

  return (
    <Box>
      <Group justify="space-between" align="flex-start" mb="lg">
        <Box>
          <Logo variant="onLight" size={26} />
          <Text className="brand-label" mt="md">
            Proposta de preços
          </Text>
          <Title order={1} fz={22} mt={2}>
            {data.titulo}
          </Title>
        </Box>
        <Text fz={12} c="dimmed" ta="right">
          Emitido em {fmtDate(new Date().toISOString())}
          <br />
          Valor de referência: {brl(data.valorReferencia)}
        </Text>
      </Group>

      <Table withTableBorder withColumnBorders verticalSpacing={6} fz={12.5}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={32}>#</Table.Th>
            <Table.Th>Descrição do serviço</Table.Th>
            <Table.Th w={56}>Unid.</Table.Th>
            <Table.Th w={70}>Qtd.</Table.Th>
            <Table.Th w={110}>Preço unit.</Table.Th>
            <Table.Th w={120}>Subtotal</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.itens.map((item, i) => {
            const sub = c.itens[i]?.subtotal ?? 0;
            const semPreco = c.itens[i]?.semPreco ?? true;
            return (
              <Table.Tr key={item.id}>
                <Table.Td>{i + 1}</Table.Td>
                <Table.Td>{item.descricao}</Table.Td>
                <Table.Td>{item.unidade ?? '—'}</Table.Td>
                <Table.Td ta="right">{item.quantidade ?? '—'}</Table.Td>
                <Table.Td ta="right">
                  {item.precoUnitario != null ? brl(item.precoUnitario) : '—'}
                </Table.Td>
                <Table.Td ta="right">{semPreco ? '—' : brl(sub)}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      <Group justify="flex-end" mt="lg">
        <Box w={300}>
          <Linha rotulo="Custo direto" valor={brl(c.custoDireto)} />
          <Linha rotulo={`BDI (${c.bdiPercentual}%)`} valor={brl(c.valorBdi)} />
          <Box
            mt={6}
            pt={6}
            style={{ borderTop: '2px solid var(--mantine-color-graphite-9)' }}
          >
            <Group justify="space-between">
              <Text fw={700}>Valor global</Text>
              <Text fw={800} fz={18}>
                {brl(c.valorGlobal)}
              </Text>
            </Group>
            {comp && (
              <Text fz={11} c="dimmed" ta="right" mt={2}>
                {comp.abaixoDoTeto
                  ? `${comp.diferencaPercentual}% abaixo do teto · folga de ${brl(comp.economia)}`
                  : `${Math.abs(comp.diferencaPercentual)}% acima do teto`}
              </Text>
            )}
          </Box>
        </Box>
      </Group>

      {data.cronograma.length > 0 && (
        <Box mt={40}>
          <Text className="brand-label" mb="xs">
            Cronograma físico-financeiro
          </Text>
          <Table withTableBorder withColumnBorders verticalSpacing={6} fz={12.5}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={32}>#</Table.Th>
                <Table.Th>Etapa</Table.Th>
                <Table.Th w={90}>%</Table.Th>
                <Table.Th w={140}>Valor</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.cronograma.map((e, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{i + 1}</Table.Td>
                  <Table.Td>{e.descricao}</Table.Td>
                  <Table.Td ta="right">{e.percentual.toLocaleString('pt-BR')}%</Table.Td>
                  <Table.Td ta="right">{brl(e.valor)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      <Text fz={10} c="dimmed" mt={48}>
        Proposta gerada no PrumoLicita. Confira os valores antes de anexar ao
        processo licitatório.
      </Text>
    </Box>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Group justify="space-between" mt={4}>
      <Text fz={13} c="dimmed">
        {rotulo}
      </Text>
      <Text fz={13} fw={600}>
        {valor}
      </Text>
    </Group>
  );
}
