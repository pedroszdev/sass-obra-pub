import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconCreditCard,
  IconSettings,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { abrirPortalAssinatura, ApiError, criarCheckout } from '../lib/api';
import { fmtDate } from '../lib/format';
import { rotuloTrial } from '../lib/trial';

// Assinatura (T-131). O status vem TODO do backend (§3.3) — esta tela não decide
// nada, só renderiza e manda o usuário para a Stripe.
//
// O pagamento em si acontece no Checkout hospedado da Stripe: nenhum dado de
// cartão passa por nós (LGPD/T-102 — a Stripe tokeniza). A gestão (trocar cartão,
// faturas, cancelar) é o Customer Portal, também deles: por isso não existe tela
// nossa para isso.

const BENEFICIOS = [
  'Obras da sua região, captadas automaticamente',
  'Diagnóstico de aptidão: a gente diz se você pode participar',
  'Resumo do edital por IA — 80 páginas em 1 tela',
  'Proposta com planilha do edital, BDI e cronograma',
];

export function AssinaturaPage() {
  const { user, refreshUser } = useAuth();
  const [params] = useSearchParams();
  const [carregando, setCarregando] = useState<'checkout' | 'portal' | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);

  const assinatura = user?.assinatura ?? null;
  const ativa = assinatura?.status === 'active';
  const jaPagou = ativa || assinatura?.status === 'past_due';

  // Volta do Checkout. NÃO confirma nada: quem confirma o pagamento é o webhook
  // (T-129). Este parâmetro é só navegação — um usuário pode digitá-lo na barra
  // de endereços. Por isso a tela apenas RECARREGA o usuário e mostra o que o
  // backend disser.
  const voltouDoPagamento = params.get('status') === 'ok';

  async function irPara(
    acao: 'checkout' | 'portal',
    fn: () => Promise<{ url: string }>,
  ) {
    setErro(null);
    setCarregando(acao);
    try {
      const { url } = await fn();
      window.location.href = url; // sai do app: o Checkout/Portal é da Stripe
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível continuar. Tente de novo em instantes.',
      );
      setCarregando(null);
    }
  }

  return (
    <Stack p="lg" gap="lg" maw={720}>
      <div>
        <Title order={2} fz={24} ff="heading">
          Assinatura
        </Title>
        <Text c="dimmed" fz="sm" mt={4}>
          Seu plano e a forma de pagamento.
        </Text>
      </div>

      {voltouDoPagamento && !ativa && (
        // Honesto: o pagamento pode levar alguns segundos para ser confirmado
        // (o webhook precisa chegar). Dizer "assinatura ativa!" aqui seria mentir
        // com base num parâmetro de URL.
        <Alert color="blue" title="Estamos confirmando seu pagamento">
          Isso costuma levar alguns segundos. Atualize a página em instantes — o
          status abaixo muda sozinho quando a confirmação chegar.
        </Alert>
      )}

      {erro && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={18} />}
          title="Deu problema"
        >
          {erro}
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fz="sm" c="dimmed">
              Plano
            </Text>
            <Text fz={20} fw={700} ff="heading">
              PrumoLicita
            </Text>
          </div>
          <StatusBadge />
        </Group>

        <AvisoPeriodo />

        <List
          mt="lg"
          spacing={6}
          icon={<IconCheck size={16} color="var(--mantine-color-teal-6)" />}
        >
          {BENEFICIOS.map((b) => (
            <List.Item key={b}>
              <Text fz="sm">{b}</Text>
            </List.Item>
          ))}
        </List>

        <Group mt="xl">
          {!ativa && (
            <Button
              leftSection={<IconCreditCard size={16} />}
              loading={carregando === 'checkout'}
              onClick={() => void irPara('checkout', criarCheckout)}
            >
              {jaPagou ? 'Atualizar pagamento' : 'Assinar'}
            </Button>
          )}
          {jaPagou && (
            <Button
              variant="default"
              leftSection={<IconSettings size={16} />}
              loading={carregando === 'portal'}
              onClick={() => void irPara('portal', abrirPortalAssinatura)}
            >
              Gerenciar assinatura
            </Button>
          )}
          <Button variant="subtle" color="gray" onClick={() => void refreshUser()}>
            Atualizar status
          </Button>
        </Group>
      </Card>

      <Text fz="xs" c="dimmed">
        O pagamento é processado pela Stripe. Nenhum dado do seu cartão passa
        pelos nossos servidores.
      </Text>
    </Stack>
  );

  // Deixa CLARO o que muitos SaaS escondem: cancelar NÃO corta na hora. Quem
  // cancelou mantém o acesso até o fim do período já pago (T-144) — cobrar o mês
  // e entregar meio seria roubo. E mostra a data para a pessoa não achar que
  // perdeu o dinheiro ao clicar em cancelar.
  function AvisoPeriodo() {
    if (!assinatura) return null;
    const ate = assinatura.currentPeriodEnd;
    if (assinatura.status === 'canceled' && ate && assinatura.acessoPermitido) {
      return (
        <Text fz="sm" c="dimmed" mt="xs">
          Assinatura cancelada. Você continua com acesso até{' '}
          <strong>{fmtDate(ate)}</strong>. Depois disso, seus dados ficam
          guardados por 90 dias caso queira voltar.
        </Text>
      );
    }
    if (assinatura.status === 'active' && ate) {
      return (
        <Text fz="sm" c="dimmed" mt="xs">
          Renova automaticamente em <strong>{fmtDate(ate)}</strong>.
        </Text>
      );
    }
    return null;
  }

  function StatusBadge() {
    if (!assinatura) return null;
    if (assinatura.emTrial) {
      return (
        <Badge color="orange" variant="light" size="lg">
          Teste · {rotuloTrial(assinatura.diasRestantesTrial)}
        </Badge>
      );
    }
    switch (assinatura.status) {
      case 'active':
        return (
          <Badge color="teal" variant="light" size="lg">
            Assinatura ativa
          </Badge>
        );
      case 'past_due':
        return (
          <Badge color="red" variant="light" size="lg">
            Pagamento pendente
          </Badge>
        );
      case 'canceled':
        return (
          <Badge
            color={assinatura.acessoPermitido ? 'orange' : 'gray'}
            variant="light"
            size="lg"
          >
            {assinatura.acessoPermitido ? 'Cancelada · acesso ativo' : 'Cancelada'}
          </Badge>
        );
      default:
        return (
          <Badge color="gray" variant="light" size="lg">
            Teste encerrado
          </Badge>
        );
    }
  }
}
