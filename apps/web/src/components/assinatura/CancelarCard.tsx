import { Button, Card, Text, Title } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { fmtDate } from '../../lib/format';
import type { AssinaturaMe } from '../../types/auth';

// Cancelamento (T-131/T-144).
//
// Diz em voz alta o que muitos SaaS escondem: cancelar NÃO corta na hora. Quem
// cancela mantém o acesso até o fim do que já pagou — cobrar o período inteiro e
// entregar metade seria roubo. A data aparece para a pessoa não achar que perdeu
// o dinheiro ao clicar.

interface Props {
  assinatura: AssinaturaMe;
  onPortal: () => void;
  abrindoPortal: boolean;
}

export function CancelarCard({ assinatura, onPortal, abrindoPortal }: Props) {
  const cancelada =
    assinatura.status === 'canceled' || assinatura.cancelAtPeriodEnd;
  const ate = fmtDate(assinatura.currentPeriodEnd);

  if (cancelada) {
    return (
      <Card withBorder radius="md" p="lg">
        <Title order={4} fz={16} ff="heading">
          Assinatura cancelada
        </Title>
        <Text fz="sm" c="dimmed" mt={6}>
          Não haverá nova cobrança. Você continua com acesso até{' '}
          <Text span fw={700} c="var(--mantine-color-text)">
            {ate}
          </Text>{' '}
          e, depois disso, seus dados ficam guardados por 90 dias caso queira
          voltar.
        </Text>
        <Button
          mt="md"
          variant="default"
          size="sm"
          rightSection={<IconExternalLink size={14} />}
          loading={abrindoPortal}
          onClick={onPortal}
        >
          Reativar na Stripe
        </Button>
      </Card>
    );
  }

  return (
    <Card withBorder radius="md" p="lg">
      <Title order={4} fz={16} ff="heading">
        Cancelar assinatura
      </Title>
      <Text fz="sm" c="dimmed" mt={6}>
        O acesso continua até{' '}
        <Text span fw={700} c="var(--mantine-color-text)">
          {ate}
        </Text>{' '}
        (fim do período pago). Suas propostas, documentos e obras salvas ficam
        guardados — se voltar, está tudo aqui.
      </Text>
      <Button
        mt="md"
        variant="outline"
        color="alerta"
        size="sm"
        rightSection={<IconExternalLink size={14} />}
        loading={abrindoPortal}
        onClick={onPortal}
      >
        Cancelar na Stripe
      </Button>
    </Card>
  );
}
