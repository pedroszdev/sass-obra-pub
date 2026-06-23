import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { brl, fmtDate } from '../lib/format';
import { MOCK_ORCAMENTOS, type MockOrcamento } from '../mocks';
import classes from '../styles/cards.module.css';

const STATUS_COLOR: Record<MockOrcamento['status'], string> = {
  Concluído: 'green',
  'Em elaboração': 'orange',
  Rascunho: 'gray',
};

export function OrcamentosPage() {
  return (
    <Box style={{ flex: 1 }} px="xl" py="lg" pb={44}>
      <Box maw={980} mx="auto">
        <Group justify="space-between" align="flex-start" mb="lg">
          <Box>
            <Title order={2} fz={18}>
              Seus orçamentos
            </Title>
            <Text fz={13} c="dimmed" mt={2}>
              Monte a planilha de preços de cada edital, com BDI, e exporte sua proposta.
            </Text>
          </Box>
          <Button leftSection={<IconPlus size={16} />}>Novo orçamento</Button>
        </Group>

        <Stack gap="sm">
          {MOCK_ORCAMENTOS.map((orc) => (
            <Card
              key={orc.id}
              component={Link}
              to={`/orcamentos/${orc.id}`}
              withBorder
              radius="md"
              p="lg"
              td="none"
              c="inherit"
              className={classes.hoverCard}
            >
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xl">
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Badge color={STATUS_COLOR[orc.status]} variant="light" radius="xl" tt="none" mb="xs">
                    {orc.status}
                  </Badge>
                  <Text fz={15} fw={600} lineClamp={2} style={{ lineHeight: 1.4 }}>
                    {orc.objeto}
                  </Text>
                  <Text fz={12.5} c="dimmed" mt={6}>
                    {orc.itens} itens · BDI {orc.bdi} · atualizado em {fmtDate(orc.atualizadoEm)}
                  </Text>
                </Box>
                <Box style={{ flex: 'none', textAlign: 'right' }}>
                  <Text fz={10.5} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>
                    Total da proposta
                  </Text>
                  <Text fz={18} fw={700}>
                    {orc.total > 0 ? brl(orc.total) : '—'}
                  </Text>
                </Box>
              </Group>
            </Card>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
