import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReembolsosElegiveis, reembolsarConta } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { brlDeCentavos } from './formato';
import { MEIO_COBRANCA } from '../../lib/cobranca';
import type { CandidatoReembolso } from '../../types/auth';

// Reembolso — **operação do dono** (decisão de 04/08).
//
// 🔴 Não é fila de pedidos: o cliente pede por E-MAIL, e aqui o dono escolhe
// quem reembolsar. A lista é calculada do provedor a cada abertura, e é isso que
// faz uma cobrança já estornada sumir sozinha — não há estado nosso para
// dessincronizar.
//
// ⚠️ Só aparece quem o provedor CONSEGUE estornar (cartão e Pix). Boleto fica de
// fora: a API do Asaas não o cobre, e listá-lo daria um botão que sempre falha.
//
// ⚠️ Reembolsar aqui NÃO corta o acesso. Ele cai quando o webhook
// `PAYMENT_REFUNDED` confirmar que o dinheiro voltou (T-157) — cortar no clique
// tiraria o acesso de alguém que ainda não recebeu de volta.

export function ReembolsosCard() {
  const [lista, setLista] = useState<CandidatoReembolso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<CandidatoReembolso | null>(
    null,
  );

  const carregar = useCallback(() => {
    getReembolsosElegiveis()
      .then(setLista)
      .catch((e: unknown) => setErro((e as Error).message));
  }, []);

  useEffect(carregar, [carregar]);

  async function reembolsar(c: CandidatoReembolso): Promise<void> {
    setOcupado(c.userId);
    setErro(null);
    try {
      const r = await reembolsarConta(c.userId);
      setConfirmando(null);
      // ⚠️ "solicitado", não "reembolsado": o dinheiro volta quando o provedor
      // processar, e no cartão isso pode levar até duas faturas. Dizer que já
      // voltou seria o mesmo erro do `success_url` da Stripe (§8).
      setAviso(
        `Estorno de ${brlDeCentavos(r.valorCentavos, 'brl')} solicitado ao provedor para ${c.email}. O acesso é encerrado quando a devolução for confirmada.`,
      );
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Card withBorder padding="lg">
      <Title order={3} fz={18} mb="xs">
        Reembolsos
      </Title>
      <Text c="dimmed" fz="sm" mb="md">
        Contas com pagamento que o provedor consegue estornar. O cliente pede por
        e-mail; aqui você escolhe. Boleto não aparece — a devolução dele é por
        transferência, fora do sistema.
      </Text>

      {erro && (
        <Alert color="red" mb="md">
          {erro}
        </Alert>
      )}
      {aviso && (
        <Alert color="blue" mb="md" withCloseButton onClose={() => setAviso(null)}>
          {aviso}
        </Alert>
      )}

      {lista && lista.length === 0 && (
        <Text c="dimmed" fz="sm">
          Nenhuma conta com pagamento reembolsável agora.
        </Text>
      )}

      {lista && lista.length > 0 && (
        <Table.ScrollContainer minWidth={720}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Conta</Table.Th>
                <Table.Th>Valor</Table.Th>
                <Table.Th>Meio</Table.Th>
                <Table.Th>Prazo</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.map((c) => (
                <Table.Tr key={c.userId}>
                  {/* Leva à ficha: decidir reembolso sem ver quem é, há quanto
                      tempo assina e o histórico é decidir no escuro. */}
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/admin/contas/${c.userId}`}
                      size="sm"
                    >
                      {c.email}
                    </Anchor>
                  </Table.Td>
                  <Table.Td ff="monospace">
                    {brlDeCentavos(c.valorCentavos, 'brl')}
                  </Table.Td>
                  <Table.Td>
                    {c.meio ? (MEIO_COBRANCA[c.meio] ?? c.meio) : '—'}
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    {/* O destaque não é enfeite: no prazo, o reembolso é DIREITO
                        do cliente (art. 49 do CDC), não liberalidade. */}
                    <Badge
                      size="xs"
                      variant="light"
                      color={c.dentroDoPrazo ? 'apto' : 'gray'}
                    >
                      {c.dentroDoPrazo
                        ? `no prazo até ${fmtDate(c.prazoAte)}`
                        : `venceu ${fmtDate(c.prazoAte)}`}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      loading={ocupado === c.userId}
                      onClick={() => setConfirmando(c)}
                    >
                      Reembolsar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {/* Confirmação porque é IRREVERSÍVEL: estorno não se desfaz, e o acesso do
          cliente cai junto quando o provedor confirmar. */}
      <Modal
        opened={confirmando !== null}
        onClose={() => setConfirmando(null)}
        title="Confirmar reembolso"
        size="md"
      >
        <Stack gap="sm">
          <Text fz="sm">
            Devolver{' '}
            <strong>
              {confirmando && brlDeCentavos(confirmando.valorCentavos, 'brl')}
            </strong>{' '}
            para <strong>{confirmando?.email}</strong>?
          </Text>
          <Text fz="sm" c="dimmed">
            O estorno é integral e não pode ser desfeito. Quando o provedor
            confirmar a devolução, o acesso da conta é encerrado — os documentos e
            propostas continuam guardados.
          </Text>
          {confirmando && !confirmando.dentroDoPrazo && (
            <Alert color="alerta" variant="light">
              Este pagamento está fora dos 7 dias de arrependimento. Reembolsar
              aqui é decisão comercial sua, não obrigação legal.
            </Alert>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setConfirmando(null)}>
              Voltar
            </Button>
            <Button
              color="red"
              loading={ocupado === confirmando?.userId}
              onClick={() => confirmando && void reembolsar(confirmando)}
            >
              Reembolsar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
