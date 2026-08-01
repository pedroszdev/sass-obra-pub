import { Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconClockHour4 } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { fmtDate } from '../lib/format';
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

  // Pagamento pendente ocupa o MESMO lugar do selo de teste, e é de propósito:
  // é o único ponto da interface que aparece em toda tela. Quem está prestes a
  // perder o acesso precisa ver isso navegando, não só se abrir /assinatura —
  // e é exatamente o caso em que a pessoa não sabe que existe um boleto
  // esperando. O prazo vem calculado do backend (§3.3).
  if (assinatura?.status === 'past_due') {
    return <SeloPagamentoPendente ate={assinatura.pastDueAte} />;
  }

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

/**
 * Selo de "pagamento pendente" — mesmo lugar, outro recado.
 *
 * ⚠️ **Não diz "cartão".** Quem assina por boleto ou Pix não tem cartão nenhum,
 * e mandar essa pessoa "atualizar o cartão" é instrução impossível de seguir —
 * ela fica parada até o acesso cair. O texto fala de **cobrança**, que vale
 * para os três meios (T-208).
 *
 * A DATA é a parte útil: sem ela, "regularize" não diz se corre hoje ou na
 * semana que vem. Vem do backend (`pastDueAte`), nunca contada aqui (§3.3).
 */
function SeloPagamentoPendente({ ate }: { ate: string | null }) {
  const prazo = ate ? fmtDate(ate) : null;
  return (
    <Tooltip
      label={
        prazo
          ? `Há uma cobrança em aberto. Seu acesso vale até ${prazo} — clique para pagar.`
          : 'Há uma cobrança em aberto. Clique para regularizar e não perder o acesso.'
      }
      withArrow
    >
      <UnstyledButton
        component={Link}
        to="/assinatura"
        aria-label="Regularizar pagamento"
      >
        <Group
          gap={6}
          wrap="nowrap"
          px={10}
          py={4}
          style={{
            borderRadius: 99,
            border: '1px solid var(--mantine-color-red-3)',
            background: 'var(--mantine-color-red-0)',
          }}
        >
          <IconAlertTriangle
            size={15}
            stroke={1.8}
            color="var(--mantine-color-red-6)"
          />
          <Text fz={12.5} fw={600} c="red.8" style={{ whiteSpace: 'nowrap' }}>
            {prazo ? `Pagamento pendente · até ${prazo}` : 'Pagamento pendente'}
          </Text>
        </Group>
      </UnstyledButton>
    </Tooltip>
  );
}
