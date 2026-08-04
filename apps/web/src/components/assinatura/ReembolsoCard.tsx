import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { getSituacaoReembolso, solicitarReembolso } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { precoBRL } from '../../lib/precos';
import type { SituacaoReembolso } from '../../types/auth';

// Solicitação de reembolso (T-218).
//
// 🔴 O QUE ESTA TELA NÃO PODE ERRAR — três coisas, e todas já custaram caro em
// outras telas deste projeto:
//
//   1. **A DATA do prazo, não "7 dias".** Quem lê "7 dias" descobre tarde que
//      contava do pagamento, não de hoje. A data vem do backend (§3.3).
//   2. **Não prometer devolução imediata.** O pedido entra numa fila (decisão do
//      dono, 04/08); o dinheiro só volta quando o provedor confirmar. Dizer
//      "reembolsado" aqui é o mesmo erro do `success_url` da Stripe (§8).
//   3. **Não oferecer o que não conseguimos executar.** Boleto NÃO é estornável
//      pela API do Asaas — devolver ali exige transferência manual. Prometer
//      self-service a quem pagou assim é prometer o que não temos.

interface Props {
  /** Recarrega quando o pedido é criado, para a tela refletir a fila. */
  nonce?: number;
}

export function ReembolsoCard({ nonce = 0 }: Props) {
  const [situacao, setSituacao] = useState<SituacaoReembolso | null>(null);
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    getSituacaoReembolso(ac.signal)
      .then(setSituacao)
      // Falha em SILÊNCIO: o card some em vez de virar erro numa tela que serve
      // para outras coisas. Quem depende disto tem a Ajuda como caminho.
      .catch(() => setSituacao(null));
    return () => ac.abort();
  }, [nonce, recarregar]);

  if (!situacao?.elegibilidade.pagamentoId) return null;

  const { elegibilidade, pendente, prazoDias } = situacao;

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      await solicitarReembolso(motivo.trim() || undefined);
      setAberto(false);
      setMotivo('');
      setRecarregar((n) => n + 1);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // Já pediu: a tela vira status. Oferecer o botão de novo faria a pessoa achar
  // que o primeiro pedido se perdeu.
  if (pendente) {
    return (
      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" align="center" wrap="nowrap">
          <div>
            <Title order={4} fz={16} ff="heading">
              Reembolso solicitado
            </Title>
            <Text fz="sm" c="dimmed" mt={6}>
              Pedido em {fmtDate(pendente.solicitadoEm)}, no valor de{' '}
              <strong>{precoBRL(pendente.valorCentavos)}</strong>. Estamos
              analisando — você recebe a resposta por e-mail.
            </Text>
          </div>
          <Badge color="alerta" variant="light" style={{ flex: 'none' }}>
            em análise
          </Badge>
        </Group>
      </Card>
    );
  }

  return (
    <Card withBorder radius="md" p="lg">
      <Title order={4} fz={16} ff="heading">
        Pedir reembolso
      </Title>

      {elegibilidade.dentroDoPrazo ? (
        <Text fz="sm" c="dimmed" mt={6}>
          Você está dentro do prazo de arrependimento de {prazoDias} dias — ele
          vale até{' '}
          <Text span fw={700} c="var(--mantine-color-text)">
            {fmtDate(elegibilidade.prazoAte)}
          </Text>
          . Devolvemos o valor integral da última cobrança, e o acesso é
          encerrado quando o estorno for confirmado.
        </Text>
      ) : (
        // ⚠️ Fora do prazo NÃO é porta fechada: vira decisão comercial. Dizer
        // "não há reembolso" e ainda assim aceitar o pedido seria contraditório;
        // dizer que é analisado é o que de fato acontece.
        <Text fz="sm" c="dimmed" mt={6}>
          O prazo de arrependimento de {prazoDias} dias terminou em{' '}
          {fmtDate(elegibilidade.prazoAte)}. Você ainda pode pedir, mas fora do
          prazo cada caso é analisado individualmente.
        </Text>
      )}

      {/* 🔴 Boleto não é estornável pela API do provedor. Mandar a pessoa clicar
          num botão que vai falhar é pior que dizer a verdade aqui. */}
      {!elegibilidade.estornavelPelaApi && (
        <Alert color="alerta" mt="md" variant="light">
          A devolução do meio de pagamento usado nesta cobrança é feita por
          transferência, fora do sistema. Peça por aqui mesmo assim — vamos
          combinar os dados com você por e-mail.
        </Alert>
      )}

      <Button mt="md" variant="outline" color="gray" onClick={() => setAberto(true)}>
        Pedir reembolso
      </Button>

      <Modal
        opened={aberto}
        onClose={() => setAberto(false)}
        title="Pedir reembolso"
        size="md"
      >
        <Stack gap="sm">
          {erro && <Alert color="alerta">{erro}</Alert>}
          <Text fz="sm">
            Vamos analisar seu pedido e responder por e-mail. Se aprovado, o
            valor volta pelo mesmo meio de pagamento — no cartão, pode levar até
            duas faturas para aparecer.
          </Text>
          <Text fz="sm" c="dimmed">
            Quando o estorno for confirmado, o acesso à PrumoLicita é encerrado.
            Seus documentos e propostas continuam guardados.
          </Text>
          {/* Opcional de propósito: dentro do prazo do CDC o arrependimento não
              precisa ser justificado, e exigir explicação de quem exerce um
              direito é atrito indevido. */}
          <Textarea
            label="Quer contar o motivo? (opcional)"
            description="Ajuda a melhorar o produto — não é exigido."
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
            maxLength={1000}
            autosize
            minRows={3}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setAberto(false)}>
              Voltar
            </Button>
            <Button color="alerta" loading={enviando} onClick={() => void enviar()}>
              Enviar pedido
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
