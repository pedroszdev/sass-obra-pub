import {
  Alert,
  Anchor,
  Card,
  Center,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminBuscas } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { ResumoBuscas } from '../../types/admin';

function Metrica({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
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

// O que estão buscando + o que dá zero (T-199). Busca vazia = a região que o
// cliente quer e não temos — insumo direto da cobertura.
export function AdminBuscasPage() {
  const [resumo, setResumo] = useState<ResumoBuscas | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    getAdminBuscas()
      .then((r) => ativo && setResumo(r))
      .catch((e: unknown) => ativo && setErro((e as Error).message));
    return () => {
      ativo = false;
    };
  }, []);

  if (erro) {
    return (
      <Alert color="red" title="Falha ao carregar as buscas">
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

  return (
    <Stack>
      <div>
        <Title order={2}>Buscas</Title>
        <Text c="dimmed">
          O que os usuários buscam — e o que volta vazio (a região que querem e
          não temos).
        </Text>
      </div>

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Metrica rotulo="Buscas (total)" valor={resumo.totalBuscas} />
        <Metrica
          rotulo="Sem resultado"
          valor={resumo.semResultado}
          cor={resumo.semResultado > 0 ? 'orange' : undefined}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Title order={4} mb="sm">
            Termos mais buscados
          </Title>
          {resumo.termosTop.length === 0 ? (
            <Text c="dimmed" size="sm">
              Nenhum termo no período.
            </Text>
          ) : (
            <Table>
              <Table.Tbody>
                {resumo.termosTop.map((t) => (
                  <Table.Tr key={t.termo}>
                    <Table.Td>{t.termo}</Table.Td>
                    <Table.Td ta="right">{t.total}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>

        <Card withBorder>
          <Title order={4} mb="sm">
            Sem resultado por UF
          </Title>
          {resumo.ufsZeradasTop.length === 0 ? (
            <Text c="dimmed" size="sm">
              Nenhuma busca vazia com UF no período.
            </Text>
          ) : (
            <Table>
              <Table.Tbody>
                {resumo.ufsZeradasTop.map((u) => (
                  <Table.Tr key={u.ufs}>
                    <Table.Td>{u.ufs}</Table.Td>
                    <Table.Td ta="right">{u.total}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </SimpleGrid>

      <Card withBorder>
        <Title order={4} mb="sm">
          Buscas vazias recentes
        </Title>
        {resumo.recentesZeradas.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nenhuma busca vazia recente.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Quando</Table.Th>
                  <Table.Th>Termo</Table.Th>
                  <Table.Th>UF(s)</Table.Th>
                  <Table.Th>Valor</Table.Th>
                  <Table.Th>Conta</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {resumo.recentesZeradas.map((b) => (
                  <Table.Tr key={b.id}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {fmtDateTime(b.createdAt)}
                    </Table.Td>
                    <Table.Td>{b.termo ?? '—'}</Table.Td>
                    <Table.Td>{b.ufs?.join(', ') ?? '—'}</Table.Td>
                    <Table.Td>
                      {b.valorMin != null || b.valorMax != null
                        ? `${b.valorMin ?? 0} – ${b.valorMax ?? '∞'}`
                        : '—'}
                    </Table.Td>
                    <Table.Td>
                      {b.userId ? (
                        <Anchor component={Link} to={`/admin/contas/${b.userId}`}>
                          ver
                        </Anchor>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}
