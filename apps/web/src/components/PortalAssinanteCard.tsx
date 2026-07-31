import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import { trocarPlano } from '../lib/api';
import { MEIO_COBRANCA, STATUS_COBRANCA } from '../lib/cobranca';
import { fmtDate } from '../lib/format';
import type { CobrancaPortal, Plano } from '../types/auth';

// Portal do assinante (T-216) — a tela que existe porque **o Asaas não tem
// Customer Portal**. Onde a Stripe entregava uma URL pronta, aqui somos nós.
//
// 🔴 REGRA QUE NÃO SE QUEBRA: nenhum dado de cartão passa por esta tela. Pagar
// uma cobrança leva à página HOSPEDADA do provedor (`pagarUrl`), que serve
// boleto e Pix; e trocar de cartão é um checkout hospedado NOVO — não existe
// caminho PCI-limpo por API (medido na T-207). Um formulário de cartão aqui
// subiria nosso escopo de SAQ A para SAQ A-EP.

function brl(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function CobrancasCard({ cobrancas }: { cobrancas: CobrancaPortal[] }) {
  // A cobrança em aberto é o que a pessoa veio resolver — ela vem primeiro e
  // com o botão de ação, em vez de perdida numa tabela de histórico.
  const emAberto = cobrancas.filter(
    (c) => c.status === 'PENDING' || c.status === 'OVERDUE',
  );

  return (
    <Card withBorder padding="lg">
      <Title order={4} mb="sm">
        Cobranças
      </Title>

      {emAberto.length > 0 && (
        <Alert
          color="alerta"
          icon={<IconAlertTriangle size={18} />}
          title={
            emAberto.length === 1
              ? 'Você tem uma cobrança em aberto'
              : `Você tem ${emAberto.length} cobranças em aberto`
          }
          mb="md"
        >
          <Stack gap="xs" mt="xs">
            {emAberto.map((c) => (
              <Group key={c.id} gap="sm" wrap="wrap">
                <Text fz="sm">
                  {brl(c.valor)}
                  {c.vencimento ? ` · vence em ${fmtDate(c.vencimento)}` : ''}
                </Text>
                {c.pagarUrl && (
                  <Button
                    component="a"
                    href={c.pagarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="xs"
                    rightSection={<IconExternalLink size={14} />}
                  >
                    Pagar
                  </Button>
                )}
                {c.boletoUrl && (
                  <Anchor
                    href={c.boletoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    fz="sm"
                  >
                    Baixar boleto (PDF)
                  </Anchor>
                )}
              </Group>
            ))}
          </Stack>
        </Alert>
      )}

      {cobrancas.length === 0 ? (
        <Text fz="sm" c="dimmed">
          Nenhuma cobrança ainda.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={480}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Vencimento</Table.Th>
                <Table.Th>Valor</Table.Th>
                <Table.Th>Forma</Table.Th>
                <Table.Th>Situação</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cobrancas.map((c) => {
                const s = STATUS_COBRANCA[c.status] ?? {
                  texto: c.status,
                  cor: 'gray',
                };
                return (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      {c.vencimento ? fmtDate(c.vencimento) : '—'}
                    </Table.Td>
                    <Table.Td>{brl(c.valor)}</Table.Td>
                    <Table.Td>{c.meio ? (MEIO_COBRANCA[c.meio] ?? c.meio) : '—'}</Table.Td>
                    <Table.Td>
                      <Badge color={s.cor} variant="light">
                        {s.texto}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {/* ⚠️ "Comprovante", NUNCA "nota fiscal": a NFS-e é outra
                          coisa (T-219), e prometer documento fiscal que o
                          cliente não recebe aqui é o erro que o §8 já registra
                          sobre o recibo da Stripe. */}
                      {c.comprovanteUrl && (
                        <Anchor
                          href={c.comprovanteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          fz="sm"
                        >
                          Comprovante
                        </Anchor>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}

// 🔴 O CARTÃO NÃO SE TROCA POR AQUI — e a ausência deste botão é DECISÃO,
// não pendência. Existiu um `TrocarCartaoCard` que abria um checkout hospedado
// novo; ele **criava uma segunda assinatura** e uma cobrança imediata, deixando
// a antiga ativa e cobrando em paralelo. Bug real, achado em 31/07 com dinheiro
// (de sandbox) e removido no mesmo dia.
//
// Por que não há substituto: o único endpoint que troca o cartão de uma
// assinatura existente é `PUT /subscriptions/{id}/creditCard`, e ele exige o
// cartão — ou um token que só nasce mandando o PAN para um servidor nosso.
// Isso sobe o escopo de SAQ A para SAQ A-EP (T-207). Checkout hospedado novo
// NÃO é substituto: em modo recorrente ele cria assinatura, não atualiza cartão.
//
// ⚠️ Consequência de produto que precisa de decisão do dono: **cartão vencido
// hoje não tem conserto self-service**. O cliente cai em `past_due` e o caminho
// é cancelar e assinar de novo, ou suporte. É um argumento real a favor de
// boleto/Pix como meio principal — ou de reabrir a conversa sobre tokenização.

export function TrocarPlanoCard({
  planoAtual,
  onTrocado,
}: {
  planoAtual: Plano;
  onTrocado: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );
  const alvo: Plano = planoAtual === 'mensal' ? 'anual' : 'mensal';

  async function trocar() {
    setSalvando(true);
    setAviso(null);
    try {
      const r = await trocarPlano(alvo);
      // ⚠️ A DATA vai junto de propósito. Sem ela, "plano anual" mentiria sobre
      // a cobrança em aberto, que continua no valor do plano antigo — a troca
      // vale na VIRADA do ciclo, sem proporcional (decisão do dono).
      setAviso({
        ok: true,
        texto: r.valeAPartirDe
          ? `Plano ${r.plano} a partir de ${fmtDate(r.valeAPartirDe)}. A cobrança em aberto segue no valor atual.`
          : `Plano ${r.plano} na próxima cobrança.`,
      });
      onTrocado();
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card withBorder padding="lg">
      <Title order={4} mb="xs">
        Plano
      </Title>
      {aviso && (
        <Alert color={aviso.ok ? 'green' : 'red'} mb="sm">
          {aviso.texto}
        </Alert>
      )}
      <Text fz="sm" c="dimmed" mb="md">
        Você está no plano <strong>{planoAtual}</strong>. A troca vale a partir
        da próxima cobrança — nada é cobrado nem estornado agora.
      </Text>
      <Button variant="light" onClick={() => void trocar()} loading={salvando}>
        Mudar para o plano {alvo}
      </Button>
    </Card>
  );
}
