import { Box, Card, Divider, Flex, Group, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingCards } from '../components/StateViews';
import { useAgenda } from '../hooks/useAgenda';
import { calendarYmd, daysUntil } from '../lib/format';
import classes from '../styles/cards.module.css';
import type { AgendaEvento, AgendaTipo } from '../types/agenda';

// Rótulo + cor por tipo de prazo (T-91). Mapeados para os tokens da marca.
const TIPO_LABEL: Record<AgendaTipo, string> = {
  entrega_proposta: 'Entrega da proposta',
  certidao_vencimento: 'Vencimento de certidão',
};
const TIPO_COLOR: Record<AgendaTipo, string> = {
  entrega_proposta: 'orange',
  certidao_vencimento: 'aco',
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Link de cada evento: proposta (se houver) → edital → documentos (certidão).
function eventoLink(e: AgendaEvento): string {
  if (e.propostaId) return `/orcamentos/${e.propostaId}`;
  if (e.editalId) return `/editais/${e.editalId}`;
  return '/documentos';
}

function MiniCalendar({ eventos }: { eventos: AgendaEvento[] }) {
  // Ancorado no mês do primeiro prazo, pra os marcadores aparecerem.
  const primeiro = calendarYmd(eventos[0].data);
  const y = primeiro?.year ?? new Date().getFullYear();
  const m = primeiro?.month ?? new Date().getMonth() + 1;
  const first = new Date(y, m - 1, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthLabel = first.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  // dia → cor (token) do prazo naquele dia (no fuso de Brasília).
  const byDay = new Map<number, string>();
  const tiposPresentes = new Set<AgendaTipo>();
  for (const e of eventos) {
    const c = calendarYmd(e.data);
    if (!c) continue;
    tiposPresentes.add(e.tipo);
    if (c.year === y && c.month === m) byDay.set(c.day, TIPO_COLOR[e.tipo]);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Card withBorder radius="lg" p="lg" style={{ flex: 1, minWidth: 0 }}>
      <Text fz={16} fw={700} ff="heading" tt="capitalize" mb="md">
        {monthLabel}
      </Text>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} ta="center" fz={11} fw={600} c="dimmed" ff="monospace" py={4}>
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
                backgroundColor: color ? `var(--mantine-color-${color}-1)` : undefined,
              }}
            >
              <Text fz={13} fw={color ? 700 : 400} c={color ? `${color}.8` : undefined}>
                {day}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Divider my="md" />

      <Group gap="lg">
        {[...tiposPresentes].map((t) => (
          <Group key={t} gap={6} wrap="nowrap">
            <Box
              w={9}
              h={9}
              style={{
                borderRadius: '50%',
                backgroundColor: `var(--mantine-color-${TIPO_COLOR[t]}-6)`,
              }}
            />
            <Text fz={12} c="dimmed">
              {TIPO_LABEL[t]}
            </Text>
          </Group>
        ))}
      </Group>
    </Card>
  );
}

function PrazoCard({ evento }: { evento: AgendaEvento }) {
  const c = calendarYmd(evento.data);
  const dias = daysUntil(evento.data);
  const urgente = dias >= 0 && dias <= 7;
  const diasLabel =
    dias < 0
      ? 'encerrado'
      : dias === 0
        ? 'hoje'
        : dias === 1
          ? 'amanhã'
          : `em ${dias} dias`;
  const color = TIPO_COLOR[evento.tipo];
  const mesCurto = c
    ? new Date(c.year, c.month - 1, c.day)
        .toLocaleDateString('pt-BR', { month: 'short' })
        .replace('.', '')
    : '';

  return (
    <Card
      component={Link}
      to={eventoLink(evento)}
      withBorder
      radius="md"
      p="md"
      className={classes.hoverCard}
    >
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
            {c?.day ?? '—'}
          </Text>
          <Text fz={10} fw={700} tt="uppercase" c={`${color}.8`}>
            {mesCurto}
          </Text>
        </Box>
        <Box style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text fz={11} fw={700} c={`${color}.8`} tt="uppercase" lineClamp={1}>
              {TIPO_LABEL[evento.tipo]}
            </Text>
            <Text
              fz={11.5}
              fw={600}
              c={urgente ? 'alerta.7' : 'dimmed'}
              style={{ flex: 'none' }}
            >
              · {diasLabel}
            </Text>
          </Group>
          <Text fz={13} lineClamp={2} mt={3} style={{ lineHeight: 1.35 }}>
            {evento.titulo}
          </Text>
          {evento.subtitulo && (
            <Text fz={12} c="dimmed" mt={1} lineClamp={1}>
              {evento.subtitulo}
            </Text>
          )}
        </Box>
      </Group>
    </Card>
  );
}

export function AgendaPage() {
  const { state } = useAgenda();

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={1040} mx="auto">
        <Box mb="lg">
          <Title order={1} fz={26} style={{ letterSpacing: '-0.01em' }}>
            Agenda de prazos
          </Title>
          <Text fz="sm" c="dimmed" mt={2}>
            Entregas de proposta dos editais que você acompanha e o vencimento das
            suas certidões.
          </Text>
        </Box>

        {state.status === 'loading' && <LoadingCards count={2} />}

        {state.status === 'error' && (
          <ErrorState title="Não foi possível carregar a agenda." description={state.message} />
        )}

        {state.status === 'success' && state.data.length === 0 && (
          <EmptyState
            title="Sua agenda está limpa."
            description="Salve editais ou cadastre certidões para acompanhar os prazos por aqui."
          />
        )}

        {state.status === 'success' && state.data.length > 0 && (
          <Flex gap="lg" align="flex-start" direction={{ base: 'column', md: 'row' }}>
            <MiniCalendar eventos={state.data} />

            <Box w={{ base: '100%', md: 340 }} style={{ flex: 'none' }}>
              <Text className="brand-label" mb="sm">
                Próximos prazos
              </Text>
              <Stack gap="sm">
                {state.data.map((evento, i) => (
                  <PrazoCard key={`${evento.tipo}-${i}`} evento={evento} />
                ))}
              </Stack>
            </Box>
          </Flex>
        )}
      </Box>
    </Box>
  );
}
