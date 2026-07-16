import { Badge, Card, Group, Progress, Stack, Text, Title } from '@mantine/core';
import { fmtDate } from '../../lib/format';
import { progressoTrial, rotuloTrial, trialUrgente } from '../../lib/trial';
import type { AssinaturaMe } from '../../types/auth';

// Cabeçalho do teste grátis (T-131). Card escuro (grafite da marca) — é o bloco
// que a pessoa lê primeiro ao entrar na tela.
//
// Os DIAS vêm do backend (§3.3); só a barra é calculada aqui, e é decoração.

export function TrialCard({ assinatura }: { assinatura: AssinaturaMe }) {
  const dias = assinatura.diasRestantesTrial;
  const urgente = trialUrgente(dias);
  const pct = progressoTrial(assinatura.trialStartedAt, assinatura.trialEndsAt);

  return (
    <Card bg="graphite.9" radius="md" p="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Group gap="xs">
            <Title order={3} fz={20} ff="heading" c="white">
              Período de teste
            </Title>
            <Badge color="apto" variant="light" size="sm">
              Grátis
            </Badge>
          </Group>
          <Text fz="sm" c="graphite.4" mt={4}>
            Acesso completo a tudo — sem cartão até aqui.
          </Text>
        </div>
        <Stack gap={0} align="flex-end">
          <Text
            ff="monospace"
            fz={28}
            fw={700}
            lh={1.1}
            c={urgente ? 'orange.6' : 'concreto.1'}
          >
            {rotuloTrial(dias)}
          </Text>
          {dias > 1 && (
            <Text ff="monospace" fz="xs" c="graphite.5">
              restantes
            </Text>
          )}
        </Stack>
      </Group>

      <Group justify="space-between" mt="lg" mb={6} gap="xs">
        <Text fz="xs" c="graphite.5">
          Teste iniciado em {fmtDate(assinatura.trialStartedAt)}
        </Text>
        <Text fz="xs" c="graphite.4" ff="monospace">
          termina {fmtDate(assinatura.trialEndsAt)}
        </Text>
      </Group>
      <Progress value={pct} color="orange.8" bg="graphite.7" size="sm" />

      <Text fz="xs" c="graphite.5" mt="md">
        Depois de {fmtDate(assinatura.trialEndsAt)}, você perde o acesso até
        assinar — as propostas e documentos ficam guardados.
      </Text>
    </Card>
  );
}

// Trial acabou e a pessoa não assinou: mesmo bloco, outra conversa. Dizer
// "0 dias restantes" com barra cheia seria cruel e pouco útil — aqui o que
// importa é que os dados dela continuam lá.
export function TrialEncerradoCard({ assinatura }: { assinatura: AssinaturaMe }) {
  return (
    <Card bg="graphite.9" radius="md" p="lg">
      <Group gap="xs">
        <Title order={3} fz={20} ff="heading" c="white">
          Seu teste terminou
        </Title>
        <Badge color="graphite" variant="light" size="sm">
          Encerrado
        </Badge>
      </Group>
      <Text fz="sm" c="graphite.4" mt={6}>
        O teste grátis foi até {fmtDate(assinatura.trialEndsAt)}. Suas propostas,
        documentos e obras salvas continuam guardados — assine e está tudo como
        você deixou.
      </Text>
    </Card>
  );
}
