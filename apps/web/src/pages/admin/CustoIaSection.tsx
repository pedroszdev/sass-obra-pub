import {
  Alert,
  Anchor,
  Card,
  Center,
  Group,
  Loader,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminIaCusto } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { usd } from './formato';
import type { PainelIaCusto } from '../../types/admin';

function Metrica({
  rotulo,
  valor,
  sub,
  destaque,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  destaque?: boolean;
}) {
  return (
    <Card withBorder padding="md">
      <Text size={destaque ? '28px' : 'xl'} fw={700}>
        {valor}
      </Text>
      <Text size="sm" c="dimmed">
        {rotulo}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </Card>
  );
}

// Custo de IA (T-190b + a leitura da T-190a). Duas fontes com HISTÓRICOS
// DIFERENTES, e a tela diz isso: totais/projeção/por-dia somam as tabelas de
// cache (histórico completo, é o que alimenta o teto da T-133); hit rate e
// custo por conta vêm do ai_usage, que só existe a partir de 24/07/2026.
export function CustoIaSection() {
  const [p, setP] = useState<PainelIaCusto | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    getAdminIaCusto()
      .then((r) => ativo && setP(r))
      .catch((e: unknown) => ativo && setErro((e as Error).message));
    return () => {
      ativo = false;
    };
  }, []);

  if (erro) {
    return (
      <Alert color="red" title="Falha ao carregar o custo de IA">
        {erro}
      </Alert>
    );
  }
  if (!p) {
    return (
      <Center py="md">
        <Loader color="orange" size="sm" />
      </Center>
    );
  }

  const usoMensal =
    p.tetos.mensalUsd > 0 ? (p.mes / p.tetos.mensalUsd) * 100 : null;
  const maxDia = Math.max(1, ...p.porDia.map((d) => d.total));

  return (
    <Stack>
      <div>
        <Title order={3}>Custo de IA</Title>
        <Text size="sm" c="dimmed">
          Gasto em USD (UTC).
        </Text>
      </div>

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Metrica
          rotulo="Gasto no mês"
          valor={usd(p.mes)}
          sub={`projeção ${usd(p.projecaoMes)}`}
          destaque
        />
        <Metrica rotulo="Hoje" valor={usd(p.hoje)} />
        <Metrica
          rotulo="Exigências + resumo (mês)"
          valor={usd(p.porFeatureMes.exigenciasResumo)}
        />
        <Metrica
          rotulo="Itens da planilha (mês)"
          valor={usd(p.porFeatureMes.itens)}
        />
      </SimpleGrid>

      {(p.tetos.mensalUsd > 0 || p.tetos.diarioUsd > 0) && (
        <Card withBorder padding="sm">
          <Group justify="space-between" mb={usoMensal != null ? 6 : 0}>
            <Text size="sm" fw={600}>
              Teto de IA (T-133)
            </Text>
            <Text size="xs" c="dimmed">
              {p.tetos.diarioUsd > 0 ? `diário ${usd(p.tetos.diarioUsd)}` : ''}
              {p.tetos.diarioUsd > 0 && p.tetos.mensalUsd > 0 ? ' · ' : ''}
              {p.tetos.mensalUsd > 0 ? `mensal ${usd(p.tetos.mensalUsd)}` : ''}
            </Text>
          </Group>
          {usoMensal != null && (
            <Progress
              value={Math.min(100, usoMensal)}
              color={usoMensal >= 90 ? 'red' : usoMensal >= 70 ? 'yellow' : 'green'}
            />
          )}
        </Card>
      )}

      <Card withBorder padding="sm">
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={600}>
            Cache e atribuição por conta (mês)
          </Text>
          <Text size="xs" c="dimmed">
            {p.inicioHistorico
              ? `medindo desde ${fmtDate(p.inicioHistorico)}`
              : 'sem uso registrado ainda'}
          </Text>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }} mb="sm">
          <Metrica
            rotulo="Hit rate do cache"
            // Null ≠ 0%: "ainda não houve acesso" não é "o cache nunca serviu".
            valor={
              p.hitRateMes.taxa == null
                ? '—'
                : `${Math.round(p.hitRateMes.taxa * 100)}%`
            }
            sub={`${p.hitRateMes.hits} do cache · ${p.hitRateMes.chamadas} à OpenAI`}
          />
        </SimpleGrid>

        {p.porContaMes.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nenhum uso de IA atribuído a uma conta no mês.
          </Text>
        ) : (
          <>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Conta</Table.Th>
                  <Table.Th>Chamadas</Table.Th>
                  <Table.Th>Cache</Table.Th>
                  <Table.Th>Custo</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {p.porContaMes.map((c) => (
                  <Table.Tr key={c.userId}>
                    <Table.Td>
                      <Anchor component={Link} to={`/admin/contas/${c.userId}`}>
                        {c.email ?? '(conta excluída)'}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{c.chamadas}</Table.Td>
                    <Table.Td>{c.hits}</Table.Td>
                    <Table.Td>{usd(c.custoUsd)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed" mt="xs">
              A soma desta lista é MENOR que o gasto do mês: a pré-computação
              roda em background, sem usuário atrás, e não é de ninguém.
            </Text>
          </>
        )}
      </Card>

      <Card withBorder padding="sm">
        <Text size="sm" fw={600} mb="xs">
          Custo por dia (14 dias)
        </Text>
        {p.porDia.length === 0 ? (
          <Text size="sm" c="dimmed">
            Sem custo no período.
          </Text>
        ) : (
          <Stack gap={4}>
            {p.porDia.map((d) => (
              <Group key={d.dia} gap="sm" wrap="nowrap">
                <Text size="xs" c="dimmed" w={90} style={{ flexShrink: 0 }}>
                  {d.dia}
                </Text>
                <Progress
                  value={(d.total / maxDia) * 100}
                  color="orange"
                  style={{ flex: 1 }}
                />
                <Text size="xs" w={70} ta="right" style={{ flexShrink: 0 }}>
                  {usd(d.total)}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
