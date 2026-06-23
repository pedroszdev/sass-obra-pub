import { Badge, Box, Card, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { brl } from '../lib/format';
import classes from '../styles/cards.module.css';
import type { EditalListItem } from '../types/edital';
import { PrazoBadge } from './PrazoBadge';

// Card de um edital na lista de resultados. Card inteiro clicável → detalhe.
export function EditalCard({ edital }: { edital: EditalListItem }) {
  return (
    <Card
      component={Link}
      to={`/editais/${edital.id}`}
      withBorder
      radius="md"
      p="lg"
      className={classes.hoverCard}
      td="none"
      c="inherit"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xl">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap={7}>
            <Badge color="orange" variant="light" radius="xl" size="sm">
              {edital.modalidadeNome}
            </Badge>
            {edital.situacao && (
              <Badge
                color="gray"
                variant="light"
                radius="xl"
                size="sm"
                tt="none"
                styles={{ label: { fontWeight: 600 } }}
              >
                {edital.situacao}
              </Badge>
            )}
          </Group>

          <Text fz={16} fw={600} lineClamp={2} mt={9} mb={7} style={{ lineHeight: 1.38 }}>
            {edital.objeto}
          </Text>
          <Text fz={13.5} fw={500} c="gray.7">
            {edital.orgaoNome}
          </Text>
          <Text fz={12.5} c="dimmed" mt={2}>
            {edital.municipioNome} / {edital.uf} · Fonte: {edital.fonte}
          </Text>
        </Box>

        <Stack gap="md" align="flex-end" w={178} style={{ flex: 'none' }}>
          <Box style={{ textAlign: 'right' }}>
            <Text fz={10.5} c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: 0.4 }}>
              Valor estimado
            </Text>
            <Text fz={16} fw={700}>
              {brl(edital.valorEstimado)}
            </Text>
          </Box>
          <Box style={{ textAlign: 'right' }}>
            <Text
              fz={10.5}
              c="dimmed"
              tt="uppercase"
              fw={500}
              mb={3}
              style={{ letterSpacing: 0.4 }}
            >
              Prazo da proposta
            </Text>
            <PrazoBadge prazo={edital.prazoProposta} />
          </Box>
        </Stack>
      </Group>
    </Card>
  );
}
