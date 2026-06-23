import { Badge, Text } from '@mantine/core';
import { prazoFlags } from '../lib/format';

interface PrazoBadgeProps {
  prazo: string | null;
  urgentDays?: number;
}

// Prazo da proposta: badge vermelho quando urgente (≤ urgentDays), texto normal
// caso contrário. Reaproveitado na lista e no detalhe.
export function PrazoBadge({ prazo, urgentDays }: PrazoBadgeProps) {
  const { fmt, urgente, badge } = prazoFlags(prazo, urgentDays);

  if (!urgente) {
    return (
      <Text fz={14} fw={600}>
        {fmt}
      </Text>
    );
  }

  return (
    <Badge
      color="red"
      variant="light"
      radius="sm"
      tt="none"
      style={{ border: '1px solid var(--mantine-color-red-2)' }}
      styles={{ label: { fontWeight: 700 } }}
    >
      {fmt} · {badge}
    </Badge>
  );
}
