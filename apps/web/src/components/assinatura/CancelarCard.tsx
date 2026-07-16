import { Anchor, Button, Card, Text, Title } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
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
        {/* Também aqui: quem acabou de cancelar pode estar dentro dos 7 dias da
            primeira cobrança e ter direito à devolução. */}
        <PoliticaReembolso />
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
      <PoliticaReembolso />
    </Card>
  );
}

// A política de reembolso, dita onde a pessoa procura por ela (T-157). Fica aqui
// e não escondida na Privacidade: quem está pensando em sair é exatamente quem
// precisa saber — e um cliente que não acha a regra abre chargeback, que custa
// mais caro que o reembolso.
//
// O texto tem que continuar batendo com a Privacidade (§5) e com o que o dono
// pratica. Se a política mudar, muda nos DOIS lugares.
function PoliticaReembolso() {
  return (
    <Text fz="xs" c="dimmed" mt="md" style={{ lineHeight: 1.6 }}>
      <strong style={{ fontWeight: 600 }}>Quer o dinheiro de volta?</strong>{' '}
      Devolvemos o valor integral se você pedir em até 7 dias da sua primeira
      cobrança — é só falar com a gente pela{' '}
      <Anchor component={Link} to="/ajuda" fz="xs" inherit>
        Ajuda
      </Anchor>
      . Passado esse prazo, e nas renovações, não há reembolso — mas cancelar
      nunca gera cobrança nova.
    </Text>
  );
}
