import {
  Anchor,
  Box,
  Card,
  Group,
  RingProgress,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  type Icon,
  IconExternalLink,
  IconX,
} from '@tabler/icons-react';
import type { ProntidaoState } from '../hooks/useProntidao';
import type { ProntidaoItem, ProntidaoStatus } from '../types/company-profile';

const STATUS_UI: Record<
  ProntidaoStatus,
  { color: string; icon: Icon; ordem: number }
> = {
  nao_atendido: { color: 'red', icon: IconX, ordem: 0 },
  atencao: { color: 'orange', icon: IconAlertTriangle, ordem: 1 },
  atendido: { color: 'green', icon: IconCheck, ordem: 2 },
};

function ItemRow({ item }: { item: ProntidaoItem }) {
  const ui = STATUS_UI[item.status];
  const ItemIcon = ui.icon;
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <ThemeIcon
        variant="light"
        color={ui.color}
        radius="xl"
        size={22}
        style={{ flex: 'none', marginTop: 1 }}
      >
        <ItemIcon size={13} />
      </ThemeIcon>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text fz={13.5} fw={600} lh={1.3}>
          {item.label}
        </Text>
        <Text fz={12} c="dimmed">
          {item.motivo}
        </Text>
        {item.regularizacao && <GuiaRegularizacao guia={item.regularizacao} />}
      </Box>
    </Group>
  );
}

// Onde/como emitir a certidão pendente (T-111). Link direto quando há portal
// nacional; senão, só o nome do órgão. A observação é honesta sobre o prazo.
function GuiaRegularizacao({
  guia,
}: {
  guia: NonNullable<ProntidaoItem['regularizacao']>;
}) {
  return (
    <Box mt={4}>
      {guia.url ? (
        <Anchor href={guia.url} target="_blank" rel="noopener noreferrer" fz={12}>
          <Group gap={4} wrap="nowrap" display="inline-flex">
            <IconExternalLink size={12} />
            Emitir em {guia.orgao}
          </Group>
        </Anchor>
      ) : (
        <Text fz={12} fw={500} c="gray.7">
          Emitir em {guia.orgao}
        </Text>
      )}
      <Text fz={11} c="dimmed" lh={1.3}>
        {guia.observacao}
      </Text>
    </Box>
  );
}

/** Painel de prontidão genérica (T-46): anel + semáforo do que falta. */
export function ProntidaoPanel({ state }: { state: ProntidaoState }) {
  if (state.status === 'loading') {
    return (
      <Card withBorder radius="md" p="lg" mb="lg">
        <Group gap="lg">
          <Skeleton circle h={88} w={88} />
          <Box style={{ flex: 1 }}>
            <Skeleton h={14} w="40%" mb={10} />
            <Skeleton h={12} w="70%" mb={6} />
            <Skeleton h={12} w="55%" />
          </Box>
        </Group>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card
        withBorder
        radius="md"
        p="md"
        mb="lg"
        style={{ borderColor: 'var(--mantine-color-red-2)' }}
      >
        <Text fz="sm" c="red.7">
          {state.message}
        </Text>
      </Card>
    );
  }

  const { itens, atendidos, total, atencao, naoAtendidos, percentual } =
    state.data;
  const ordenados = [...itens].sort(
    (a, b) => STATUS_UI[a.status].ordem - STATUS_UI[b.status].ordem,
  );
  // Evita NaN nas seções do anel quando não há requisitos (total 0) — T-110.
  const frac = (n: number): number => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card withBorder radius="md" p="lg" mb="lg">
      <Group gap="lg" align="center" mb="md" wrap="nowrap">
        <RingProgress
          size={92}
          thickness={9}
          roundCaps
          label={
            <Text ta="center" fz={20} fw={800}>
              {percentual}%
            </Text>
          }
          sections={[
            { value: frac(atendidos), color: 'green' },
            { value: frac(atencao), color: 'orange' },
            { value: frac(naoAtendidos), color: 'red' },
          ]}
          style={{ flex: 'none' }}
        />
        <Box>
          <Text fz={15} fw={700}>
            Prontidão de habilitação
          </Text>
          <Text fz={13.5} c="gray.7" mt={2}>
            Você atende <b>{atendidos}</b> de <b>{total}</b> requisitos comuns de
            obra pública.
          </Text>
          {(naoAtendidos > 0 || atencao > 0) && (
            <Text fz={12.5} c="dimmed" mt={2}>
              {naoAtendidos > 0 && `${naoAtendidos} a resolver`}
              {naoAtendidos > 0 && atencao > 0 && ' · '}
              {atencao > 0 && `${atencao} a conferir`}
            </Text>
          )}
        </Box>
      </Group>

      <Stack gap={10}>
        {ordenados.map((item) => (
          <ItemRow key={item.key} item={item} />
        ))}
      </Stack>

      <Text fz={11} c="dimmed" mt="md">
        Diagnóstico genérico dos requisitos que quase toda obra exige. A análise
        por edital específico vem depois.
      </Text>
    </Card>
  );
}
