import { Box, Card, Divider, Flex, Group, Stack, Text, Title } from '@mantine/core';
import { daysUntil } from '../lib/format';
import { MOCK_PRAZOS } from '../mocks';
import classes from '../styles/cards.module.css';

// Cor por tipo de prazo (mock §7). Mapeada para os tokens da marca.
const TIPO_COLOR: Record<string, string> = {
  'Entrega da proposta': 'alerta',
  'Sessão de disputa': 'orange',
  'Impugnação / esclarecimento': 'aco',
};
const tipoColor = (t: string): string => TIPO_COLOR[t] ?? 'graphite';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function MiniCalendar() {
  // Ancorado no mês do primeiro prazo (mock), pra os marcadores aparecerem.
  const [y, m] = MOCK_PRAZOS[0].data.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthLabel = first.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  // dia → cor (token) do prazo naquele dia.
  const byDay = new Map<number, string>();
  for (const p of MOCK_PRAZOS) {
    const [py, pm, pd] = p.data.split('-').map(Number);
    if (py === y && pm === m) byDay.set(pd, tipoColor(p.tipo));
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const tiposPresentes = [...new Set(MOCK_PRAZOS.map((p) => p.tipo))];

  return (
    <Card withBorder radius="lg" p="lg" style={{ flex: 1, minWidth: 0 }}>
      <Text fz={16} fw={700} ff="heading" tt="capitalize" mb="md">
        {monthLabel}
      </Text>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={i}
            ta="center"
            fz={11}
            fw={600}
            c="dimmed"
            ff="monospace"
            py={4}
          >
            {w}
          </Text>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <Box key={`b${i}`} />;
          const color = byDay.get(day);
          return (
            <Box
              key={day}
              ta="center"
              py={9}
              style={{
                borderRadius: 8,
                fontVariantNumeric: 'tabular-nums',
                backgroundColor: color
                  ? `var(--mantine-color-${color}-1)`
                  : undefined,
              }}
            >
              <Text
                fz={13}
                fw={color ? 700 : 400}
                c={color ? `${color}.8` : undefined}
              >
                {day}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Divider my="md" />

      <Group gap="lg">
        {tiposPresentes.map((t) => (
          <Group key={t} gap={6} wrap="nowrap">
            <Box
              w={9}
              h={9}
              style={{
                borderRadius: '50%',
                backgroundColor: `var(--mantine-color-${tipoColor(t)}-6)`,
              }}
            />
            <Text fz={12} c="dimmed">
              {t}
            </Text>
          </Group>
        ))}
      </Group>
    </Card>
  );
}

export function AgendaPage() {
  const prazos = [...MOCK_PRAZOS].sort((a, b) => a.data.localeCompare(b.data));

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={1040} mx="auto">
        <Box mb="lg">
          <Title order={1} fz={26} style={{ letterSpacing: '-0.01em' }}>
            Agenda de prazos
          </Title>
          <Text fz="sm" c="dimmed" mt={2}>
            Tudo que vence — proposta, sessão de disputa, impugnação.
          </Text>
        </Box>

        <Flex gap="lg" align="flex-start" direction={{ base: 'column', md: 'row' }}>
          <MiniCalendar />

          {/* próximos prazos */}
          <Box w={{ base: '100%', md: 340 }} style={{ flex: 'none' }}>
            <Text className="brand-label" mb="sm">
              Próximos prazos
            </Text>
            <Stack gap="sm">
              {prazos.map((prazo, i) => {
                const date = new Date(`${prazo.data}T00:00:00`);
                const dias = daysUntil(prazo.data);
                const urgente = dias >= 0 && dias <= 7;
                const diasLabel =
                  dias < 0
                    ? 'encerrado'
                    : dias === 0
                      ? 'hoje'
                      : dias === 1
                        ? 'amanhã'
                        : `em ${dias} dias`;
                const color = tipoColor(prazo.tipo);
                return (
                  <Card key={i} withBorder radius="md" p="md" className={classes.hoverCard}>
                    <Group gap="md" wrap="nowrap" align="flex-start">
                      <Box
                        ta="center"
                        w={48}
                        py={6}
                        style={{
                          flex: 'none',
                          backgroundColor: `var(--mantine-color-${color}-1)`,
                          borderRadius: 9,
                        }}
                      >
                        <Text fz={18} fw={800} lh={1} c={`${color}.8`}>
                          {date.getDate()}
                        </Text>
                        <Text fz={10} fw={700} tt="uppercase" c={`${color}.8`}>
                          {date
                            .toLocaleDateString('pt-BR', { month: 'short' })
                            .replace('.', '')}
                        </Text>
                      </Box>
                      <Box style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap">
                          <Text fz={11} fw={700} c={`${color}.8`} tt="uppercase" lineClamp={1}>
                            {prazo.tipo}
                          </Text>
                          <Text fz={11.5} fw={600} c={urgente ? 'alerta.7' : 'dimmed'} style={{ flex: 'none' }}>
                            · {diasLabel}
                          </Text>
                        </Group>
                        <Text fz={13} lineClamp={2} mt={3} style={{ lineHeight: 1.35 }}>
                          {prazo.objeto}
                        </Text>
                      </Box>
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        </Flex>

        <Text fz={11} c="dimmed" mt="xl">
          Prazos de exemplo — a agenda ainda está em construção e será ligada aos
          editais que você acompanha.
        </Text>
      </Box>
    </Box>
  );
}
