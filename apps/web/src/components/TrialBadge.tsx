import { Group, Text, Tooltip } from '@mantine/core';
import { IconClockHour4 } from '@tabler/icons-react';
import { useAuth } from '../context/auth-context';
import { rotuloTrial, trialUrgente } from '../lib/trial';

// Contagem do teste grátis no topo (T-131, parte que já é real hoje).
//
// O QUE ESTE COMPONENTE NÃO FAZ: não decide nada. Os dias vêm calculados do
// backend (§3.3) — o front que contasse sozinho divergiria do sistema no dia em
// que o fuso ou o arredondamento discordassem, e "quantos dias me restam" é
// exatamente o tipo de número que não pode ter duas versões.
//
// Também NÃO oferece "assinar": o Checkout é a T-128, que depende do preço e da
// conta na Stripe. Um botão que não leva a lugar nenhum seria a tela mockada que
// o §7 manda não criar. Quando o Checkout existir, o CTA nasce aqui.

export function TrialBadge() {
  const { user } = useAuth();
  const assinatura = user?.assinatura;

  // Só fala quando tem o que dizer: fora do trial (pagante, ou trial já vencido)
  // este componente some. Nada de "0 dias restantes" piscando na cara de quem já
  // paga.
  if (!assinatura?.emTrial) return null;

  const dias = assinatura.diasRestantesTrial;
  const urgente = trialUrgente(dias);
  const label = rotuloTrial(dias);

  return (
    <Tooltip
      label={
        urgente
          ? 'Seu teste grátis está acabando.'
          : 'Você está no período de teste gratuito.'
      }
      withArrow
    >
      <Group
        gap={6}
        wrap="nowrap"
        px={10}
        py={4}
        style={{
          borderRadius: 99,
          border: `1px solid var(--mantine-color-${urgente ? 'orange' : 'gray'}-3)`,
          background: urgente
            ? 'var(--mantine-color-orange-0)'
            : 'transparent',
        }}
      >
        <IconClockHour4
          size={15}
          stroke={1.8}
          color={`var(--mantine-color-${urgente ? 'orange' : 'gray'}-6)`}
        />
        <Text
          fz={12.5}
          fw={600}
          c={urgente ? 'orange.8' : 'dimmed'}
          style={{ whiteSpace: 'nowrap' }}
        >
          Teste · {label}
        </Text>
      </Group>
    </Tooltip>
  );
}
