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
import { getAdminDashboard } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { ResumoAdmin } from '../../types/admin';

function Metrica({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: number;
  cor?: string;
}) {
  return (
    <Card withBorder padding="md">
      <Text size="xl" fw={700} c={cor}>
        {valor}
      </Text>
      <Text size="sm" c="dimmed">
        {rotulo}
      </Text>
    </Card>
  );
}

// Home do backoffice (T-194 v1): números do negócio que já existem no banco.
// MRR (preço vive na Stripe), custo de IA (T-190) e funil/coorte de conversão
// entram nas entregas seguintes.
export function AdminHomePage() {
  const [resumo, setResumo] = useState<ResumoAdmin | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    getAdminDashboard()
      .then((r) => ativo && setResumo(r))
      .catch((e: unknown) => ativo && setErro((e as Error).message));
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
        "Hoje" conta desde o início do dia (UTC). MRR, custo de IA e funil de
        conversão entram nas próximas entregas (T-190/T-188). Canceladas é o total,
        não do mês.
      </Text>
    </Stack>
  );
}
