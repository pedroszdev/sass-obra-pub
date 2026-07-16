import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  List,
  Radio,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconCheck, IconLock } from '@tabler/icons-react';
import { precoBRL, rotuloEconomia, sufixoPlano } from '../../lib/precos';
import type { Plano, PrecoPlano, PrecosResponse } from '../../types/auth';

// Escolha do plano + assinar (T-131).
//
// Os preços vêm da Stripe (`GET /assinaturas/precos`) e NUNCA daqui: um número
// escrito no JSX mentiria no dia seguinte a uma mudança no Dashboard.

const BENEFICIOS = [
  'Resumos de edital ilimitados',
  'Diagnóstico de aptidão em toda obra',
  'Propostas ilimitadas com exportação PDF e CSV',
  'Alertas de vencimento de certidão',
  'Todas as UFs que você quiser monitorar',
  'Agenda de prazos e alertas diários',
];

interface Props {
  precos: PrecosResponse | null;
  carregandoPrecos: boolean;
  plano: Plano;
  onPlano: (p: Plano) => void;
  onAssinar: () => void;
  assinando: boolean;
  /** Já pagou alguma vez (past_due/cancelada): muda o rótulo do botão. */
  jaPagou?: boolean;
}

export function PlanosCard({
  precos,
  carregandoPrecos,
  plano,
  onPlano,
  onAssinar,
  assinando,
  jaPagou = false,
}: Props) {
  return (
    <Card withBorder radius="md" p="lg" style={{ borderColor: 'var(--mantine-color-orange-8)' }}>
      <Group align="stretch" gap="xl" wrap="wrap">
        <Stack gap={4} style={{ flex: '1 1 280px' }}>
          <Title order={3} fz={22} ff="heading">
            PrumoLicita Completo
          </Title>
          <Text fz="sm" c="orange.9">
            Um plano só, com tudo dentro.
          </Text>
          <List
            mt="md"
            spacing={8}
            icon={<IconCheck size={15} color="var(--mantine-color-apto-8)" />}
          >
            {BENEFICIOS.map((b) => (
              <List.Item key={b}>
                <Text fz="sm">{b}</Text>
              </List.Item>
            ))}
          </List>
        </Stack>

        <Divider orientation="vertical" visibleFrom="sm" />

        <Stack gap="sm" style={{ flex: '0 1 260px' }}>
          {carregandoPrecos && <Skeleton height={150} radius="md" />}

          {!carregandoPrecos && !precos && (
            // Sem preço não há botão de assinar: mandar a pessoa ao Checkout
            // sem ela saber quanto vai pagar é o oposto de honesto.
            <Text fz="sm" c="dimmed">
              Não foi possível carregar os planos agora. Atualize a página em
              instantes.
            </Text>
          )}

          {precos && (
            <>
              <Radio.Group value={plano} onChange={(v) => onPlano(v as Plano)}>
                <Stack gap="sm">
                  <OpcaoPlano preco={precos.mensal} rotulo="Mensal" />
                  <OpcaoPlano
                    preco={precos.anual}
                    rotulo="Anual"
                    selo={rotuloEconomia(precos.mesesGratis)}
                  />
                </Stack>
              </Radio.Group>

              <Button
                size="md"
                mt="xs"
                loading={assinando}
                onClick={onAssinar}
                fullWidth
              >
                {jaPagou ? 'Reativar assinatura' : 'Assinar agora'}
              </Button>
              <Group gap={6} justify="center">
                <IconLock size={13} color="var(--mantine-color-dimmed)" />
                <Text fz="xs" c="dimmed">
                  Pagamento seguro via Stripe
                </Text>
              </Group>
            </>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

function OpcaoPlano({
  preco,
  rotulo,
  selo,
}: {
  preco: PrecoPlano;
  rotulo: string;
  selo?: string | null;
}) {
  return (
    <Radio.Card value={preco.plano} p="sm" radius="md" withBorder>
      <Group justify="space-between" wrap="nowrap" align="center">
        <div>
          <Group gap={6}>
            <Text fz="sm" fw={600}>
              {rotulo}
            </Text>
            {selo && (
              <Badge color="apto" variant="light" size="xs">
                {selo}
              </Badge>
            )}
          </Group>
          <Group gap={2} align="baseline" mt={2}>
            <Text ff="monospace" fz={20} fw={700}>
              {precoBRL(preco.valor)}
            </Text>
            <Text ff="monospace" fz="xs" c="dimmed">
              {sufixoPlano(preco.plano)}
            </Text>
          </Group>
        </div>
        <Radio.Indicator />
      </Group>
    </Radio.Card>
  );
}
