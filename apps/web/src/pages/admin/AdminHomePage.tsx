import {
  Alert,
  Anchor,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboard, getAdminIaCusto, getAdminMrr } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { Mrr, PainelIaCusto, ResumoAdmin } from '../../types/admin';
import { brlDeCentavos, usd } from './formato';

function Metrica({
  rotulo,
  valor,
  cor,
  sub,
  destaque,
}: {
  rotulo: string;
  valor: number | string;
  cor?: string;
  sub?: string;
  destaque?: boolean;
}) {
  return (
    <Card withBorder padding="md">
      <Text size={destaque ? '28px' : 'xl'} fw={700} c={cor}>
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

// Home do backoffice (T-194): números do negócio. Receita (MRR) e custo de IA
// vêm dos painéis que já existem — /admin/billing/mrr (T-192) e /admin/ia-custo
// (T-190b) —, então a home só os agrega. Funil de ativação e coorte de conversão
// seguem adiados. Funil/coorte à parte, os dois são BEST-EFFORT: MRR depende da
// Stripe (o preço vive lá, §8) e não pode derrubar o painel inteiro se ela cair.
export function AdminHomePage() {
  const [resumo, setResumo] = useState<ResumoAdmin | null>(null);
  const [mrr, setMrr] = useState<Mrr | null>(null);
  const [ia, setIa] = useState<PainelIaCusto | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    getAdminDashboard()
      .then((r) => ativo && setResumo(r))
      .catch((e: unknown) => ativo && setErro((e as Error).message));
    // Best-effort: falha aqui vira "—" no card, não erro de página.
    getAdminMrr()
      .then((r) => ativo && setMrr(r))
      .catch(() => undefined);
    getAdminIaCusto()
      .then((r) => ativo && setIa(r))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  if (erro) {
    return (
      <Alert color="red" title="Falha ao carregar o painel">
        {erro}
      </Alert>
    );
  }
  if (!resumo) {
    return (
      <Center py="xl">
        <Loader color="orange" />
      </Center>
    );
  }

  const { assinaturas, trialsExpirando, cadastros, produto } = resumo;

  return (
    <Stack>
      <div>
        <Title order={2}>Painel</Title>
        <Text c="dimmed">Visão do negócio hoje.</Text>
      </div>

      <div>
        <Text fw={600} mb="xs">
          Receita e custo
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Metrica
            rotulo="MRR simples"
            valor={mrr ? brlDeCentavos(mrr.mrrCentavos, mrr.moeda) : '—'}
            sub={
              mrr
                ? `${mrr.ativosMensal} mensais · ${mrr.ativosAnual} anuais`
                : 'preço indisponível'
            }
            destaque
          />
          <Metrica
            rotulo="Custo de IA no mês"
            valor={ia ? usd(ia.mes) : '—'}
            sub={ia ? `projeção ${usd(ia.projecaoMes)}` : undefined}
          />
          <Metrica rotulo="Custo de IA hoje" valor={ia ? usd(ia.hoje) : '—'} />
        </SimpleGrid>
      </div>

      <div>
        <Text fw={600} mb="xs">
          Assinaturas
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Metrica rotulo="Pagantes" valor={assinaturas.pagantes} cor="green" />
          <Metrica rotulo="Em teste" valor={assinaturas.emTrial} cor="blue" />
          <Metrica
            rotulo="Pagamento pendente"
            valor={assinaturas.pastDue}
            cor={assinaturas.pastDue > 0 ? 'yellow' : undefined}
          />
          <Metrica rotulo="Canceladas (total)" valor={assinaturas.canceladas} />
        </SimpleGrid>
      </div>

      <div>
        <Text fw={600} mb="xs">
          Cadastros e produto
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Metrica rotulo="Cadastros hoje" valor={cadastros.hoje} />
          <Metrica rotulo="Cadastros 7 dias" valor={cadastros.ultimos7d} />
          <Metrica rotulo="Editais novos hoje" valor={produto.editaisHoje} />
          <Metrica rotulo="Alertas enviados hoje" valor={produto.alertasHoje} />
        </SimpleGrid>
      </div>

      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Trials expirando (≤48h)</Title>
          <Badge color={trialsExpirando.total > 0 ? 'orange' : 'gray'}>
            {trialsExpirando.total}
          </Badge>
        </Group>
        {trialsExpirando.contas.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nenhum trial expira nas próximas 48h.
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>E-mail</Table.Th>
                <Table.Th>Expira</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {trialsExpirando.contas.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/admin/contas/${c.id}`}>
                      {c.email}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    {c.trialEndsAt ? fmtDateTime(c.trialEndsAt) : '—'}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Text size="xs" c="dimmed">
        "Hoje" conta desde o início do dia (UTC). O MRR soma os dois provedores (T-221) e é
        best-effort: some se ela estiver fora. Custo de IA em USD, receita em
        BRL — os dois não se somam aqui (não há câmbio no sistema). Funil de
        ativação e coorte de conversão seguem adiados. Canceladas é o total, não
        do mês.
      </Text>
    </Stack>
  );
}
