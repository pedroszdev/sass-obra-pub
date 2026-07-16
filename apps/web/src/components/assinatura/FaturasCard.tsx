import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconDownload, IconExternalLink } from '@tabler/icons-react';
import { fmtDate } from '../../lib/format';
import { nomePlano, precoBRL, rotuloStatusFatura } from '../../lib/precos';
import type { AssinaturaMe, DetalhesAssinatura } from '../../types/auth';

// Histórico de cobrança (T-131). As últimas faturas aqui; o histórico completo
// é o Portal da Stripe.
//
// O PDF é RECIBO, não NFS-e. Rotulá-lo de "NF" prometeria ao cliente um
// documento fiscal que ele não recebe aqui — a nota de serviço é emitida fora do
// sistema (§9).

interface Props {
  assinatura: AssinaturaMe;
  detalhes: DetalhesAssinatura | null;
  carregando: boolean;
  onPortal: () => void;
  abrindoPortal: boolean;
}

export function FaturasCard({
  assinatura,
  detalhes,
  carregando,
  onPortal,
  abrindoPortal,
}: Props) {
  return (
    <Card withBorder radius="md" p="lg">
      <Group justify="space-between" align="center" mb="md">
        <Title order={4} fz={16} ff="heading">
          Faturas
        </Title>
        <Button
          variant="default"
          size="xs"
          rightSection={<IconExternalLink size={13} />}
          loading={abrindoPortal}
          onClick={onPortal}
        >
          Ver todas na Stripe
        </Button>
      </Group>

      {carregando && <Skeleton height={44} radius="sm" />}

      {!carregando && detalhes?.faturas.length === 0 && (
        <Text fz="sm" c="dimmed">
          Nenhuma fatura ainda. A primeira aparece aqui depois da cobrança.
        </Text>
      )}

      {!carregando && !detalhes && (
        <Text fz="sm" c="dimmed">
          Não foi possível carregar suas faturas agora.
        </Text>
      )}

      <Stack gap={0}>
        {detalhes?.faturas.map((f, i) => {
          const rotulo = rotuloStatusFatura(f.status);
          return (
            <Group
              key={f.id}
              justify="space-between"
              wrap="nowrap"
              py="sm"
              gap="sm"
              style={{
                borderTop:
                  i === 0 ? undefined : '1px solid var(--mantine-color-gray-2)',
              }}
            >
              <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
                <Text ff="monospace" fz="xs" c="dimmed" w={80}>
                  {fmtDate(f.data)}
                </Text>
                <Text fz="sm" fw={600} truncate>
                  PrumoLicita Completo — {nomePlano(assinatura.plano).toLowerCase()}
                </Text>
              </Group>
              <Group gap="md" wrap="nowrap">
                <Badge color={rotulo.cor} variant="light" size="sm">
                  {rotulo.texto}
                </Badge>
                <Text ff="monospace" fz="sm" fw={600}>
                  {precoBRL(f.valor)}
                </Text>
                {f.reciboUrl ? (
                  <Anchor
                    href={f.reciboUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    fz="xs"
                    c="orange.8"
                    fw={600}
                  >
                    <Group gap={3} wrap="nowrap">
                      Recibo
                      <IconDownload size={13} />
                    </Group>
                  </Anchor>
                ) : (
                  <Text fz="xs" c="dimmed" w={48} ta="right">
                    —
                  </Text>
                )}
              </Group>
            </Group>
          );
        })}
      </Stack>

      <Text fz="xs" c="dimmed" mt="md">
        O recibo é o comprovante de pagamento da Stripe. Precisa de nota fiscal?
        Fale com a gente que emitimos.
      </Text>
    </Card>
  );
}
