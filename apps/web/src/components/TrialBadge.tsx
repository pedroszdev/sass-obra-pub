import { Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconClockHour4 } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { rotuloTrial, trialUrgente } from '../lib/trial';

// Contagem do teste grátis no topo (T-131, parte que já é real hoje).
//
// O QUE ESTE COMPONENTE NÃO FAZ: não decide nada. Os dias vêm calculados do
// backend (§3.3) — o front que contasse sozinho divergiria do sistema no dia em
// que o fuso ou o arredondamento discordassem, e "quantos dias me restam" é
// exatamente o tipo de número que não pode ter duas versões.
//
// Agora que o Checkout existe (T-128), o selo é CLICÁVEL e leva à página de
// assinatura — o caminho para pagar precisa estar sempre à mão, especialmente
// quando o teste está acabando.

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
          ? 'Seu teste grátis está acabando — clique para assinar.'
          : 'Você está no período de teste gratuito. Clique para ver o plano.'
      }
      withArrow
    >
      <UnstyledButton
        component={Link}
        to="/assinatura"
        aria-label="Ver assinatura"
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
      </UnstyledButton>
    </Tooltip>
  );
}
