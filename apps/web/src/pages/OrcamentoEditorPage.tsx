import {
  Box,
  Button,
  Card,
  Group,
  Progress,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../components/StateViews';
import { brl } from '../lib/format';
import { MOCK_BDI, MOCK_CRONOGRAMA, MOCK_ORCAMENTOS, MOCK_PLANILHA } from '../mocks';

export function OrcamentoEditorPage() {
  const { editalId } = useParams();
  const navigate = useNavigate();
  const orcamento = MOCK_ORCAMENTOS.find((o) => o.id === editalId);

  if (!orcamento) {
    return (
      <Box p="xl" style={{ flex: 1 }}>
        <Box maw={980} mx="auto">
          <EmptyState
            title="Orçamento não encontrado."
            actionLabel="Voltar para orçamentos"
            onAction={() => navigate('/orcamentos')}
          />
        </Box>
      </Box>
    );
  }

  const custoDireto = MOCK_PLANILHA.reduce(
    (sum, item) => sum + item.qtd * item.precoUnitario,
    0,
  );
  const bdiValor = custoDireto * MOCK_BDI;
  const total = custoDireto + bdiValor;

  return (
    <Box style={{ flex: 1 }} px="xl" py="lg" pb={44}>
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

        <Card withBorder radius="lg" p="xl">
          <Text fz={17} fw={700} style={{ lineHeight: 1.35 }}>
            {orcamento.objeto}
          </Text>
          <Text fz={13} c="dimmed" mt={4}>
            {orcamento.orgao} · {orcamento.local} · Valor de referência:{' '}
            {brl(orcamento.valorReferencia)}
          </Text>
        </Card>

        <Card withBorder radius="lg" p={0} mt="sm">
          <Table.ScrollContainer minWidth={680}>
            <Table verticalSpacing="sm" horizontalSpacing="lg">
              <Table.Thead bg="gray.0">
                <Table.Tr>
                  <Table.Th w={40}>#</Table.Th>
                  <Table.Th>Descrição do serviço</Table.Th>
                  <Table.Th w={70} ta="center">
                    Unid.
                  </Table.Th>
                  <Table.Th w={90} ta="right">
                    Qtd.
                  </Table.Th>
                  <Table.Th w={120} ta="right">
                    Preço unit.
                  </Table.Th>
                  <Table.Th w={130} ta="right">
                    Total
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {MOCK_PLANILHA.map((item, i) => (
                  <Table.Tr key={i}>
                    <Table.Td c="gray.5">{i + 1}</Table.Td>
                    <Table.Td>{item.desc}</Table.Td>
                    <Table.Td ta="center" c="dimmed">
                      {item.unid}
                    </Table.Td>
                    <Table.Td ta="right">{item.qtd.toLocaleString('pt-BR')}</Table.Td>
                    <Table.Td ta="right">{brl(item.precoUnitario)}</Table.Td>
                    <Table.Td ta="right" fw={600}>
                      {brl(item.qtd * item.precoUnitario)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Box p="md">
            <Button
              variant="outline"
              color="orange"
              size="xs"
              leftSection={<IconPlus size={14} />}
              styles={{ root: { borderStyle: 'dashed' } }}
            >
              Adicionar item (banco SINAPI/SICRO)
            </Button>
          </Box>
        </Card>

        <Group align="flex-start" gap="sm" mt="sm" grow wrap="wrap">
          <Card withBorder radius="lg" p="xl" miw={320}>
            <Text fz={14} fw={700} mb="md">
              Cronograma físico-financeiro
            </Text>
            <Stack gap="md">
              {MOCK_CRONOGRAMA.map((fase) => (
                <Box key={fase.fase}>
                  <Group justify="space-between" mb={5}>
                    <Text fz={12.5} c="gray.7">
                      {fase.fase}
                    </Text>
                    <Text fz={12.5} fw={600}>
                      {fase.pct}%
                    </Text>
                  </Group>
                  <Progress value={fase.pct} color="orange" size="sm" radius="xl" />
                </Box>
              ))}
            </Stack>
          </Card>

          <Card withBorder radius="lg" p="xl" miw={280}>
            <Text fz={14} fw={700} mb="md">
              Composição da proposta
            </Text>
            <Group
              justify="space-between"
              py="xs"
              style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}
            >
              <Text fz={13.5} c="gray.7">
                Custo direto
              </Text>
              <Text fz={13.5} fw={600}>
                {brl(custoDireto)}
              </Text>
            </Group>
            <Group
              justify="space-between"
              py="xs"
              style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}
            >
              <Text fz={13.5} c="gray.7">
                BDI (24,5%)
              </Text>
              <Text fz={13.5} fw={600}>
                {brl(bdiValor)}
              </Text>
            </Group>
            <Group justify="space-between" align="center" pt="md" pb={4}>
              <Text fz={13} fw={700} tt="uppercase" style={{ letterSpacing: 0.4 }}>
                Total
              </Text>
              <Text fz={20} fw={800} c="orange.8">
                {brl(total)}
              </Text>
            </Group>
            <Button fullWidth mt="md">
              Exportar proposta (PDF / planilha)
            </Button>
          </Card>
        </Group>
      </Box>
    </Box>
  );
}
