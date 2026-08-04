import { Badge, Button, Card, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { fmtDate } from '../../lib/format';
import { nomePlano, precoBRL, sufixoPlano } from '../../lib/precos';
import type { AssinaturaMe, PrecosResponse } from '../../types/auth';

// Cabeçalho de quem já assina (T-131): o plano, o que vem a seguir e os
// caminhos de gestão — que são tela NOSSA desde a T-216, porque o Asaas não tem
// portal hospedado (T-207).

interface Props {
  assinatura: AssinaturaMe;
  precos: PrecosResponse | null;
  /** Portal HOSPEDADO do provedor. Ausente = não existe (Asaas, T-207). */
  onPortal?: () => void;
  abrindoPortal?: boolean;
  /** Troca de plano por tela NOSSA. Ausente = a troca é no portal do provedor. */
  onTrocarPlano?: () => void;
  trocandoPlano?: boolean;
  /** Forma de pagamento quando não há cartão salvo (boleto/Pix). */
  formaPagamento?: string;
  /**
   * O valor que a ASSINATURA cobra, em centavos — lido do provedor.
   *
   * 🔴 **Não use o catálogo aqui.** O valor fica congelado na assinatura quando
   * ela nasce: quem assinou por X segue sendo debitado em X depois que o preço
   * no `/admin` vira Y. Mostrar o catálogo anunciava um número diferente do que
   * sai da conta do cliente (bug real, 04/08).
   *
   * `null` = não deu para ler. Aí o card mostra o plano SEM valor, em vez de
   * cair no catálogo: número plausível e errado é pior que número nenhum.
   */
  valorCentavos?: number | null;
  /** Troca de cartão por tela NOSSA (Asaas). Ausente = não oferecida. */
  onTrocarCartao?: () => void;
}

// ⚠️ O MESMO card serve Stripe e Asaas, de propósito: o assinante vê a mesma
// tela nos dois, e a diferença de provedor não vaza para o layout. O que muda
// são as AÇÕES — a Stripe manda para o Customer Portal, o Asaas usa tela nossa,
// porque portal hospedado ele não tem (T-207).
export function AssinanteCard({
  assinatura,
  precos,
  onPortal,
  abrindoPortal,
  onTrocarPlano,
  trocandoPlano,
  formaPagamento,
  valorCentavos,
  onTrocarCartao,
}: Props) {
  // ⚠️ `precos` só serve à ECONOMIA do anual — que é comparação de tabela
  // ("o anual sai X mais barato"), não o que será debitado. O valor cobrado vem
  // da assinatura, em `valorCentavos`.

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
            {/* 📌 "assinante desde" vinha do `start_date` da Stripe (§8) e saiu
                no corte (T-224): não temos coluna equivalente, e inventar uma
                nasceria NULA para todo mundo. */}
            {nomePlano(assinatura.plano)}
          </Text>
        </div>
        {valorCentavos != null && (
          <Group gap={2} align="baseline" wrap="nowrap">
            <Text ff="monospace" fz={26} fw={700} c="concreto.1" lh={1.1}>
              {precoBRL(valorCentavos)}
            </Text>
            <Text ff="monospace" fz="xs" c="graphite.5">
              {sufixoPlano(assinatura.plano)}
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
        {/* 📌 Lia o cartão salvo da Stripe até a T-224. No Asaas a forma vem da
            própria cobrança (T-216), que é o que `formaPagamento` traz. */}
        {formaPagamento && (
          <Dado rotulo="Forma de pagamento" valor={formaPagamento} />
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
        {onTrocarCartao && (
          <Button variant="white" size="sm" onClick={onTrocarCartao}>
            Trocar cartão
          </Button>
        )}
        {onPortal && (
          <Button
            variant="white"
            size="sm"
            rightSection={<IconExternalLink size={14} />}
            loading={abrindoPortal}
            onClick={onPortal}
          >
            Gerenciar pagamento
          </Button>
        )}
        {/* Na Stripe, trocar de plano é o Portal: ela já faz o rateio certo, e
            o §9 diz que a gestão é dela. No Asaas não há portal, e a troca é
            nossa — vale na VIRADA do ciclo, sem proporcional (T-216).
            ⚠️ SÓ renderiza com handler. Antes ele aparecia SEMPRE e caía em
            `onTrocarPlano ?? onPortal`: numa assinatura cancelada — onde os
            dois são ausentes de propósito (T-217) — sobrava um botão MORTO,
            que é pior que botão nenhum. */}
        {(onTrocarPlano || onPortal) && (
          <Button
            variant={onPortal || onTrocarCartao ? 'default' : 'white'}
            size="sm"
            rightSection={onPortal ? <IconExternalLink size={14} /> : undefined}
            loading={abrindoPortal || trocandoPlano}
            onClick={onTrocarPlano ?? onPortal}
          >
            Trocar de plano
          </Button>
        )}
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
