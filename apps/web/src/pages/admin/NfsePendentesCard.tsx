import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { getNfsePendentes, marcarNfseEmitida } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { MEIO_COBRANCA } from '../../lib/cobranca';
import { brlDeCentavos } from './formato';
import type { PagamentoSemNota } from '../../types/auth';

// NFS-e pendente (T-219) — **aviso, não emissão** (decisão do dono, 04/08).
//
// 🔴 Sondei o `invoiceSettings` do Asaas: ele exige código de serviço municipal
// e descrição do serviço, que dependem da prefeitura e do contador. Num caminho
// fiscal, código errado é ISS errado — então em vez de emitir às cegas, o
// sistema DIZ o que ficou sem nota e o dono emite à mão.
//
// ⚠️ Marcar como emitida é o que CALA o alerta por e-mail. Sem isso ele repete a
// cada rodada sobre a mesma cobrança — e alerta que repete deixa de ser lido,
// que é o fracasso descrito no §8.

export function NfsePendentesCard() {
  const [lista, setLista] = useState<PagamentoSemNota[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<PagamentoSemNota | null>(null);
  const [numero, setNumero] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    getNfsePendentes()
      .then(setLista)
      // Falha em silêncio vira lista vazia: o painel não pode quebrar por causa
      // de uma leitura auxiliar. O alerta por e-mail é a rede de verdade.
      .catch((e: unknown) => setErro((e as Error).message));
  }, []);

  useEffect(carregar, [carregar]);

  async function marcar(): Promise<void> {
    if (!marcando) return;
    setOcupado(true);
    setErro(null);
    try {
      await marcarNfseEmitida(marcando.paymentId, numero.trim() || undefined);
      setMarcando(null);
      setNumero('');
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // Some quando não há nada a fazer: card permanente vazio é ruído numa tela
  // que já é longa, e o e-mail avisa quando algo aparece.
  if (lista !== null && lista.length === 0 && !erro) return null;

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" align="baseline" mb="xs">
        <Title order={3} fz={18}>
          Notas fiscais pendentes
        </Title>
        {lista && lista.length > 0 && (
          <Badge color="alerta" variant="light">
            {lista.length} a emitir
          </Badge>
        )}
      </Group>
      <Text c="dimmed" fz="sm" mb="md">
        Cobranças pagas que ainda não têm nota. A emissão é feita por você, fora
        do sistema — marque aqui depois de emitir, senão o aviso por e-mail se
        repete.
      </Text>

      {erro && (
        <Alert color="red" mb="md">
          {erro}
        </Alert>
      )}

      {lista && lista.length > 0 && (
        <Table.ScrollContainer minWidth={680}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Conta</Table.Th>
                <Table.Th>Valor</Table.Th>
                <Table.Th>Pago em</Table.Th>
                <Table.Th>Meio</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.map((p) => (
                <Table.Tr key={p.paymentId}>
                  <Table.Td>{p.email}</Table.Td>
                  <Table.Td ff="monospace">
                    {brlDeCentavos(p.valorCentavos, 'brl')}
                  </Table.Td>
                  {/* A data do PAGAMENTO é o fato gerador da nota — não a do
                      vencimento, que com cobrança adiada fica longe dela. */}
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    {fmtDate(p.pagoEm)}
                  </Table.Td>
                  <Table.Td>
                    {p.meio ? (MEIO_COBRANCA[p.meio] ?? p.meio) : '—'}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => setMarcando(p)}
                    >
                      Marcar emitida
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal
        opened={marcando !== null}
        onClose={() => setMarcando(null)}
        title="Marcar nota como emitida"
        size="md"
      >
        <Stack gap="sm">
          <Text fz="sm">
            Confirma que a nota de{' '}
            <strong>
              {marcando && brlDeCentavos(marcando.valorCentavos, 'brl')}
            </strong>{' '}
            para <strong>{marcando?.email}</strong> foi emitida?
          </Text>
          {/* Opcional de propósito: o alerta precisa saber que a obrigação foi
              cumprida. Exigir o número faria o dono adiar a marcação — e o
              aviso continuaria disparando sobre algo já resolvido. */}
          <TextInput
            label="Número da nota (opcional)"
            description="Só para facilitar a conferência depois."
            value={numero}
            onChange={(e) => setNumero(e.currentTarget.value)}
            maxLength={60}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setMarcando(null)}>
              Voltar
            </Button>
            <Button loading={ocupado} onClick={() => void marcar()}>
              Marcar emitida
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
