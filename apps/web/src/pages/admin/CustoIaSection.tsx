import {
  Alert,
  Card,
  Center,
  Group,
  Loader,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { getAdminIaCusto } from '../../lib/api';
import type { PainelIaCusto } from '../../types/admin';

// USD com casas suficientes para valores pequenos de IA.
function usd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

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

// Custo de IA (T-190b). Reusa o que o IaCustoService já agrega (T-133). Custo por
// conta e hit rate de cache ficam para a T-190a.
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
          Gasto em USD (UTC). Custo por conta e hit rate de cache entram na T-190a.
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
