import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconExternalLink,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useDiagnosticoEdital } from '../hooks/useDiagnosticoEdital';
import type {
  DiagnosticoEditalResult,
  ProntidaoStatus,
  Veredito,
} from '../types/edital';

const VEREDITO: Record<Veredito, { label: string; color: string }> = {
  apto: { label: 'Apto', color: 'apto' },
  quase: { label: 'Quase lá', color: 'orange' },
  nao_apto: { label: 'Não apto ainda', color: 'alerta' },
  indefinido: { label: 'Sem dados p/ verificar', color: 'gray' },
};

const ITEM: Record<ProntidaoStatus, { color: string; icon: typeof IconCheck }> = {
  atendido: { color: 'apto', icon: IconCheck },
  atencao: { color: 'orange', icon: IconAlertTriangle },
  nao_atendido: { color: 'alerta', icon: IconX },
};

// Não atendido primeiro, depois atenção, depois atendido.
const PRIORIDADE: Record<ProntidaoStatus, number> = {
  nao_atendido: 0,
  atencao: 1,
  atendido: 2,
};

function DiagnosticoConteudo({ d }: { d: DiagnosticoEditalResult }) {
  const v = VEREDITO[d.veredito];
  const itens = [...d.itens].sort(
    (a, b) => PRIORIDADE[a.status] - PRIORIDADE[b.status],
  );
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Badge color={v.color} variant="filled" radius="xl" size="lg">
          {v.label}
        </Badge>
        <Text fz={13} fw={700} c="concreto.5">
          Atende {d.atendidos} de {d.total} ({d.percentual}%)
        </Text>
      </Group>

      <Stack gap="sm">
        {itens.map((item) => {
          const cfg = ITEM[item.status];
          const Icon = cfg.icon;
          return (
            <Group key={item.key} gap="sm" align="flex-start" wrap="nowrap">
              <ThemeIcon
                variant="light"
                color={cfg.color}
                radius="xl"
                size={20}
                style={{ flex: 'none', marginTop: 2 }}
              >
                <Icon size={12} />
              </ThemeIcon>
              <div>
                <Text fz={13.5} c="concreto.1">
                  {item.label}
                </Text>
                <Text fz={12.5} c="concreto.5">
                  {item.motivo}
                </Text>
              </div>
            </Group>
          );
        })}
      </Stack>

      {d.observacoes.length > 0 && (
        <div>
          <Text className="brand-label" c="concreto.6" mb="xs">
            Também exigido (confira no edital)
          </Text>
          <Stack gap={6}>
            {d.observacoes.map((o, i) => (
              <Group key={i} gap="sm" align="flex-start" wrap="nowrap">
                <ThemeIcon
                  variant="light"
                  color="gray"
                  radius="xl"
                  size={20}
                  style={{ flex: 'none', marginTop: 2 }}
                >
                  <IconInfoCircle size={12} />
                </ThemeIcon>
                <Text fz={13} c="concreto.4" style={{ lineHeight: 1.45 }}>
                  {o}
                </Text>
              </Group>
            ))}
          </Stack>
        </div>
      )}

      <Button component={Link} to="/documentos" variant="white" color="dark" size="xs">
        Atualizar meu perfil no cofre
      </Button>
    </Stack>
  );
}

// Seção "Prontidão da sua empresa para esta obra" (T-52): mostra o veredito
// específico (apto/quase/não apto) cruzando o edital (T-49) com o perfil (T-51).
// No estado com diagnóstico vira o card grafite do handoff (handoff PrumoLicita).
export function DiagnosticoEdital({ editalId }: { editalId: string }) {
  const { state, reload } = useDiagnosticoEdital(editalId);
  const dark = state.status === 'success' && !!state.result.diagnostico;

  return (
    <Card
      withBorder={!dark}
      radius="lg"
      p="xl"
      bg={dark ? 'graphite.9' : undefined}
      c={dark ? 'concreto.2' : undefined}
    >
      <Group justify="space-between" mb="sm">
        <Text fz={15} fw={700} c={dark ? 'concreto.0' : undefined}>
          Prontidão da sua empresa para esta obra
        </Text>
        <Badge color="gray" variant="light" radius="xl" size="sm" tt="uppercase">
          Diagnóstico
        </Badge>
      </Group>

      {state.status === 'loading' && (
        <Stack gap="xs">
          <Text fz={13} c="dimmed">
            Analisando sua prontidão para esta obra…
          </Text>
          <Skeleton height={12} radius="xl" />
          <Skeleton height={12} radius="xl" />
          <Skeleton height={12} width="60%" radius="xl" />
        </Stack>
      )}

      {state.status === 'error' && (
        <Group justify="space-between">
          <Text fz={13.5} c="dimmed">
            {state.message}
          </Text>
          <Button size="xs" variant="default" onClick={reload}>
            Tentar de novo
          </Button>
        </Group>
      )}

      {state.status === 'success' &&
        (state.result.diagnostico ? (
          <DiagnosticoConteudo d={state.result.diagnostico} />
        ) : state.result.exigenciasStatus === 'erro' ? (
          <Group justify="space-between" wrap="nowrap">
            <Text fz={13.5} c="dimmed">
              Não foi possível analisar sua prontidão para esta obra agora. Tente
              novamente em instantes.
            </Text>
            <Button
              size="xs"
              variant="default"
              onClick={reload}
              style={{ flex: 'none' }}
            >
              Tentar de novo
            </Button>
          </Group>
        ) : (
          <Alert
            variant="light"
            color="gray"
            icon={<IconExternalLink size={16} />}
            p="sm"
          >
            <Text fz={13.5}>
              Não dá para diagnosticar sua prontidão automaticamente: esta licitação
              não publicou o edital completo em texto. Abra o documento na fonte e
              confira as exigências de habilitação.
            </Text>
          </Alert>
        ))}
    </Card>
  );
}
