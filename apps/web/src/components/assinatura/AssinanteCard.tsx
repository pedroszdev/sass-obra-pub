import { Badge, Button, Card, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { fmtDate } from '../../lib/format';
import { nomePlano, precoBRL, sufixoPlano } from '../../lib/precos';
import type { AssinaturaMe, DetalhesAssinatura, PrecosResponse } from '../../types/auth';

// Cabeçalho de quem já assina (T-131): o plano, o que vem a seguir e os dois
// caminhos de gestão — que saem para o Portal da Stripe, não para tela nossa (§9).

interface Props {
  assinatura: AssinaturaMe;
  precos: PrecosResponse | null;
  detalhes: DetalhesAssinatura | null;
  onPortal: () => void;
  abrindoPortal: boolean;
}

export function AssinanteCard({
  assinatura,
  precos,
  detalhes,
  onPortal,
  abrindoPortal,
}: Props) {
  const preco = precos
    ? assinatura.plano === 'anual'
      ? precos.anual
      : precos.mensal
    : null;

  // Cancelada (pelo status ou pelo agendamento do Portal): não há "próxima
  // cobrança" — há uma data em que o acesso acaba. Chamar isso de cobrança
  // assustaria quem já cancelou.
  const cancelada =
    assinatura.status === 'canceled' || assinatura.cancelAtPeriodEnd;

  return (
    <Card bg="graphite.9" radius="md" p="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Group gap="xs">
            <Title order={3} fz={20} ff="heading" c="white">
              PrumoLicita Completo
            </Title>
            <StatusBadge assinatura={assinatura} />
          </Group>
          <Text fz="sm" c="graphite.4" mt={4}>
            {nomePlano(assinatura.plano)}
            {detalhes?.assinanteDesde &&
              ` · assinante desde ${fmtDate(detalhes.assinanteDesde)}`}
          </Text>
        </div>
        {preco && (
          <Group gap={2} align="baseline" wrap="nowrap">
            <Text ff="monospace" fz={26} fw={700} c="concreto.1" lh={1.1}>
              {precoBRL(preco.valor)}
            </Text>
            <Text ff="monospace" fz="xs" c="graphite.5">
              {sufixoPlano(preco.plano)}
            </Text>
          </Group>
        )}
      </Group>

      <Divider my="lg" color="graphite.7" />

      <Group gap={40} wrap="wrap">
        <Dado
          rotulo={cancelada ? 'Acesso até' : 'Próxima cobrança'}
          valor={fmtDate(assinatura.currentPeriodEnd)}
        />
        {detalhes?.cartao && (
          <Dado
            rotulo="Forma de pagamento"
            valor={`•••• ${detalhes.cartao.ultimos4}`}
          />
        )}
        {assinatura.plano === 'anual' && precos?.economiaAnual && (
          <Dado
            rotulo="Economia vs. mensal"
            valor={`${precoBRL(precos.economiaAnual)}/ano`}
            cor="apto.5"
          />
        )}
      </Group>

      <Group mt="xl" gap="sm">
        <Button
          variant="white"
          size="sm"
          rightSection={<IconExternalLink size={14} />}
          loading={abrindoPortal}
          onClick={onPortal}
        >
          Gerenciar pagamento
        </Button>
        {/* Trocar de plano é o Portal também: a Stripe já faz a troca com o
            rateio certo. Um `subscriptions.update` nosso reimplementaria isso —
            e o §9 diz que a gestão é dela. */}
        <Button
          variant="default"
          size="sm"
          rightSection={<IconExternalLink size={14} />}
          loading={abrindoPortal}
          onClick={onPortal}
        >
          Trocar de plano
        </Button>
      </Group>
    </Card>
  );
}

function Dado({
  rotulo,
  valor,
  cor = 'concreto.1',
}: {
  rotulo: string;
  valor: string;
  cor?: string;
}) {
  return (
    <Stack gap={2}>
      <Text ff="monospace" fz={10} c="graphite.5" tt="uppercase" lts={0.8}>
        {rotulo}
      </Text>
      <Text ff="monospace" fz="sm" fw={600} c={cor}>
        {valor}
      </Text>
    </Stack>
  );
}

function StatusBadge({ assinatura }: { assinatura: AssinaturaMe }) {
  if (assinatura.status === 'past_due') {
    return (
      <Badge color="alerta" variant="light" size="sm">
        Pagamento pendente
      </Badge>
    );
  }
  // Cancelou no Portal: a Stripe mantém `active`, mas para o usuário isto está
  // cancelado — só não perdeu o acesso ainda.
  if (assinatura.cancelAtPeriodEnd || assinatura.status === 'canceled') {
    return (
      <Badge color="orange" variant="light" size="sm">
        Cancelada
      </Badge>
    );
  }
  return (
    <Badge color="apto" variant="light" size="sm">
      • Ativa
    </Badge>
  );
}
