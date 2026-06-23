import { Box, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { daysUntil } from '../lib/format';
import { MOCK_PRAZOS } from '../mocks';
import classes from '../styles/cards.module.css';

export function AgendaPage() {
  return (
    <Box style={{ flex: 1 }} px="xl" py="lg" pb={44}>
      <Box maw={840} mx="auto">
        <Title order={2} fz={18}>
          Agenda de prazos
        </Title>
        <Text fz={13} c="dimmed" mt={2} mb="lg">
          Sessão de disputa, impugnação e entrega de proposta dos editais que você acompanha.
        </Text>

        <Stack gap="sm">
          {MOCK_PRAZOS.map((prazo, i) => {
            const date = new Date(`${prazo.data}T00:00:00`);
            const dias = daysUntil(prazo.data);
            const urgente = dias >= 0 && dias <= 7;
            const diasLabel = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
            return (
              <Card key={i} withBorder radius="md" p="md" className={classes.hoverCard}>
                <Group gap="md" wrap="nowrap">
                  <Box
                    ta="center"
                    w={56}
                    py={7}
                    style={{
                      flex: 'none',
                      background: urgente
                        ? 'var(--mantine-color-red-0)'
                        : 'var(--mantine-color-gray-0)',
                      border: `1px solid ${urgente ? 'var(--mantine-color-red-2)' : 'var(--mantine-color-gray-3)'}`,
                      borderRadius: 9,
                    }}
                  >
                    <Text fz={19} fw={800} lh={1} c={urgente ? 'red.8' : 'gray.7'}>
                      {date.getDate()}
                    </Text>
                    <Text fz={10.5} fw={700} tt="uppercase" c={urgente ? 'red.8' : 'gray.7'}>
                      {date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                    </Text>
                  </Box>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs">
                      <Text fz={11} fw={800} c="orange.8" tt="uppercase" style={{ letterSpacing: 0.3 }}>
                        {prazo.tipo}
                      </Text>
                      <Text fz={11.5} fw={600} c={urgente ? 'red.8' : 'dimmed'}>
                        · {diasLabel}
                      </Text>
                    </Group>
                    <Text fz={14} lineClamp={1} mt={3}>
                      {prazo.objeto}
                    </Text>
                  </Box>
                  <IconChevronRight
                    size={18}
                    color="var(--mantine-color-gray-5)"
                    style={{ flex: 'none' }}
                  />
                </Group>
              </Card>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}
