import {
  Alert,
  Anchor,
  Button,
  Card,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelarAssinatura } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import {
  MOTIVOS_CANCELAMENTO,
  type AssinaturaMe,
  type MotivoCancelamento,
} from '../../types/auth';

// Cancelamento self-service no Asaas (T-217).
//
// Existe separado do `CancelarCard` porque as duas telas fazem coisas
// diferentes: lá o botão MANDA EMBORA (abre o Customer Portal da Stripe, que
// cancela do lado dela); aqui o cancelamento é NOSSO, do começo ao fim — não há
// portal hospedado no Asaas (T-207).
//
// 🔴 O QUE ESTA TELA NÃO PODE ERRAR: dizer que o acesso continua, e até quando.
// No Asaas o cancelamento é imediato do lado do provedor (`DELETE`, medido no
// sandbox) — quem segura o acesso até o fim do período pago é regra nossa
// (T-144). Se a tela sugerir que o acesso acaba ao clicar, a pessoa acha que
// perdeu o dinheiro e abre chamado; que é exatamente o que esta task existe
// para evitar.

interface Props {
  assinatura: AssinaturaMe;
  /** Recarrega o estado depois do cancelamento (o status vem do `/users/me`). */
  onCancelado: () => void;
}

export function CancelarAsaasCard({ assinatura, onCancelado }: Props) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoCancelamento | null>(null);
  const [detalhe, setDetalhe] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cancelada =
    assinatura.status === 'canceled' || assinatura.cancelAtPeriodEnd;
  const ate = fmtDate(assinatura.currentPeriodEnd);

  async function confirmar() {
    if (!motivo) return;
    setEnviando(true);
    setErro(null);
    try {
      await cancelarAssinatura(motivo, detalhe.trim() || undefined);
      setAberto(false);
      onCancelado();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

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
        onClick={() => setAberto(true)}
      >
        Cancelar assinatura
      </Button>
      <PoliticaReembolso />

      <Modal
        opened={aberto}
        onClose={() => setAberto(false)}
        title="Cancelar assinatura"
        centered
      >
        <Stack gap="md">
          {/* A data aparece DE NOVO aqui, e não é redundância: é o último
              momento antes do clique irreversível, e é o que evita o chamado
              "cancelei e perdi o acesso na hora". */}
          <Text fz="sm">
            Seu acesso continua até{' '}
            <Text span fw={700}>
              {ate}
            </Text>
            . Não haverá nova cobrança.
          </Text>

          {/* O motivo é OBRIGATÓRIO — é o dado que a task existe para coletar, e
              perguntar depois por e-mail tem resposta perto de zero. */}
          <Radio.Group
            label="Por que você está cancelando?"
            description="Isso ajuda a melhorar o produto."
            value={motivo ?? ''}
            onChange={(v) => setMotivo(v as MotivoCancelamento)}
            withAsterisk
          >
            <Stack gap="xs" mt="xs">
              {MOTIVOS_CANCELAMENTO.map((m) => (
                <Radio key={m.valor} value={m.valor} label={m.rotulo} />
              ))}
            </Stack>
          </Radio.Group>

          <Textarea
            label="Quer contar mais? (opcional)"
            placeholder="O que faltou para a PrumoLicita valer a pena pra você?"
            value={detalhe}
            onChange={(e) => setDetalhe(e.currentTarget.value)}
            maxLength={500}
            autosize
            minRows={2}
          />

          {erro && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              {erro}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAberto(false)}>
              Voltar
            </Button>
            <Button
              color="alerta"
              loading={enviando}
              disabled={!motivo}
              onClick={() => void confirmar()}
            >
              Confirmar cancelamento
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

// Política de reembolso, mostrada junto do cancelamento.
//
// 📌 Morava no `CancelarCard` (da Stripe) e veio para cá no corte (T-224): era
// exportada de lá para ser compartilhada pelas DUAS telas, e agora só existe
// uma. Se a política mudar, muda aqui — e nos Termos (T-179), que é onde ela
// vale juridicamente.
export function PoliticaReembolso() {
  return (
    <Text fz="xs" c="dimmed" mt="md" style={{ lineHeight: 1.6 }}>
      <strong style={{ fontWeight: 600 }}>Quer o dinheiro de volta?</strong>{' '}
      Devolvemos o valor integral se você pedir em até 7 dias da última cobrança
      — é só falar com a gente pela{' '}
      <Anchor component={Link} to="/ajuda" fz="xs" inherit>
        Ajuda
      </Anchor>
      . Fora desse prazo cada caso é analisado individualmente; cancelar, em todo
      caso, nunca gera cobrança nova.
    </Text>
  );
}