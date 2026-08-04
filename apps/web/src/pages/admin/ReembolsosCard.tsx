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
  Textarea,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  aprovarReembolso,
  getAdminReembolsos,
  recusarReembolso,
} from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { brlDeCentavos } from './formato';
import type { RefundRequest } from '../../types/auth';

// Fila de reembolso do dono (T-218).
//
// 🔴 **A decisão é sua, mas dentro dos 7 dias o reembolso é DIREITO do cliente**
// (art. 49 do CDC). O passo manual existe para você executar, não para decidir
// se cabe — por isso a tela destaca "no prazo" e avisa antes de recusar. Recusar
// ali é assumir risco jurídico, e a justificativa fica registrada com autor e
// data.
//
// ⚠️ Aprovar NÃO corta o acesso. Ele cai quando o webhook `PAYMENT_REFUNDED`
// confirmar que o dinheiro voltou (T-157). Cortar antes tiraria o acesso de
// alguém que ainda não recebeu de volta.

export function ReembolsosCard() {
  const [pedidos, setPedidos] = useState<RefundRequest[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<RefundRequest | null>(null);
  const [nota, setNota] = useState('');

  const carregar = useCallback(() => {
    getAdminReembolsos()
      .then(setPedidos)
      .catch((e: unknown) => setErro((e as Error).message));
  }, []);

  useEffect(carregar, [carregar]);

  async function decidir(
    pedido: RefundRequest,
    acao: () => Promise<unknown>,
  ): Promise<void> {
    setOcupado(pedido.id);
    setErro(null);
    try {
      await acao();
      setRecusando(null);
      setNota('');
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const pendentes = (pedidos ?? []).filter((p) => p.status === 'pendente');

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" align="baseline" mb="xs">
        <Title order={3} fz={18}>
          Reembolsos
        </Title>
        {pendentes.length > 0 && (
          <Badge color="alerta" variant="light">
            {pendentes.length} aguardando
          </Badge>
        )}
      </Group>
      <Text c="dimmed" fz="sm" mb="md">
        Aprovar estorna no provedor. O acesso do cliente só cai quando o estorno
        for confirmado — não no clique.
      </Text>

      {erro && (
        <Alert color="red" mb="md">
          {erro}
        </Alert>
      )}

      {pedidos && pedidos.length === 0 && (
        <Text c="dimmed" fz="sm">
          Nenhuma solicitação até agora.
        </Text>
      )}

      {pedidos && pedidos.length > 0 && (
        <Table.ScrollContainer minWidth={760}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Pedido</Table.Th>
                <Table.Th>Valor</Table.Th>
                <Table.Th>Prazo</Table.Th>
                <Table.Th>Motivo</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pedidos.map((p) => (
                <Table.Tr key={p.id}>
                  {/* Leva à FICHA da conta: decidir um reembolso sem ver quem
                      é, há quanto tempo assina e o histórico de cobranças é
                      decidir no escuro. */}
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    {p.userId ? (
                      <Anchor
                        component={Link}
                        to={`/admin/contas/${p.userId}`}
                        size="sm"
                      >
                        {fmtDate(p.solicitadoEm)}
                      </Anchor>
                    ) : (
                      <Text fz="sm">{fmtDate(p.solicitadoEm)}</Text>
                    )}
                  </Table.Td>
                  <Table.Td ff="monospace">
                    {brlDeCentavos(p.valorCentavos, 'brl')}
                  </Table.Td>
                  <Table.Td>
                    {/* O destaque não é enfeite: "no prazo" significa que a
                        recusa é juridicamente arriscada. */}
                    <Badge
                      size="xs"
                      variant="light"
                      color={p.dentroDoPrazo ? 'apto' : 'gray'}
                    >
                      {p.dentroDoPrazo ? 'no prazo (CDC)' : 'fora do prazo'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="xs" c="dimmed" lineClamp={2}>
                      {p.motivo ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      size="xs"
                      variant="light"
                      color={
                        p.status === 'aprovada'
                          ? 'apto'
                          : p.status === 'recusada'
                            ? 'red'
                            : 'alerta'
                      }
                    >
                      {p.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {p.status === 'pendente' && (
                      <Group gap={6} wrap="nowrap">
                        <Button
                          size="xs"
                          loading={ocupado === p.id}
                          onClick={() =>
                            void decidir(p, () => aprovarReembolso(p.id))
                          }
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          onClick={() => setRecusando(p)}
                        >
                          Recusar
                        </Button>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal
        opened={recusando !== null}
        onClose={() => setRecusando(null)}
        title="Recusar reembolso"
        size="md"
      >
        <Stack gap="sm">
          {/* 🔴 O aviso aparece só quando importa. Recusar dentro do prazo é
              contrariar o art. 49 do CDC, e a tela não pode deixar isso passar
              como uma decisão qualquer. */}
          {recusando?.dentroDoPrazo && (
            <Alert color="red" title="Este pedido está dentro do prazo legal">
              O art. 49 do CDC dá 7 dias de arrependimento, e o cliente pediu
              dentro deles. Recusar aqui contraria o direito dele e fica
              registrado com seu nome e a data.
            </Alert>
          )}
          <Textarea
            label="Justificativa"
            description="Volta para o cliente. Obrigatória."
            value={nota}
            onChange={(e) => setNota(e.currentTarget.value)}
            maxLength={1000}
            autosize
            minRows={3}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRecusando(null)}>
              Voltar
            </Button>
            <Button
              color="red"
              disabled={nota.trim().length < 5}
              loading={ocupado === recusando?.id}
              onClick={() =>
                recusando &&
                void decidir(recusando, () =>
                  recusarReembolso(recusando.id, nota.trim()),
                )
              }
            >
              Recusar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
