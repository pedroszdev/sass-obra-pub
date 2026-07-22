import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Pagination,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconCheck, IconExternalLink, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminIaOutputs, marcarIaOutput } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { IaOutputsPagina, TaxaTipo, TipoSaidaIa } from '../../types/admin';

const ROTULO: Record<TipoSaidaIa, string> = {
  resumo: 'Resumo',
  exigencias: 'Exigências',
  itens: 'Itens da planilha',
};

function pct(t: TaxaTipo): string {
  const total = t.ok + t.errado;
  return total === 0 ? '—' : `${Math.round((t.ok / total) * 100)}%`;
}

function CardTaxa({ rotulo, t }: { rotulo: string; t: TaxaTipo }) {
  return (
    <Card withBorder padding="md">
      <Text size="xl" fw={700}>
        {pct(t)}
      </Text>
      <Text size="sm" c="dimmed">
        {rotulo}
      </Text>
      <Text size="xs" c="dimmed">
        {t.ok} ok · {t.errado} errado
      </Text>
    </Card>
  );
}

// Amostra de saídas de IA para conferência (T-200). Abre o edital de origem e
// marca acerto/erro — a taxa vem viva, com o modelo em prod (§3.4).
export function AdminIaPage() {
  const [tipo, setTipo] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [pagina, setPagina] = useState<IaOutputsPagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await getAdminIaOutputs({
        tipo: tipo === 'todos' ? undefined : (tipo as TipoSaidaIa),
        page,
      });
      setPagina(r);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [tipo, page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcar(
    e: { tipo: TipoSaidaIa; editalId: string },
    veredito: 'ok' | 'errado',
  ) {
    const chave = `${e.tipo}:${e.editalId}`;
    setMarcando(chave);
    try {
      await marcarIaOutput({ ...e, veredito });
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setMarcando(null);
    }
  }

  const totalPaginas = pagina ? Math.ceil(pagina.total / pagina.pageSize) : 0;

  return (
    <Stack>
      <div>
        <Title order={2}>Saídas de IA</Title>
        <Text c="dimmed">
          A IA acertou? Abra o edital, confira e marque — a taxa é viva, com o
          modelo em produção.
        </Text>
      </div>

      {pagina && (
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <CardTaxa rotulo="Geral" t={pagina.taxa.geral} />
          <CardTaxa rotulo="Resumo" t={pagina.taxa.porTipo.resumo} />
          <CardTaxa rotulo="Exigências" t={pagina.taxa.porTipo.exigencias} />
          <CardTaxa rotulo="Itens" t={pagina.taxa.porTipo.itens} />
        </SimpleGrid>
      )}

      <SegmentedControl
        value={tipo}
        onChange={(v) => {
          setTipo(v);
          setPage(1);
        }}
        data={[
          { value: 'todos', label: 'Todos' },
          { value: 'resumo', label: 'Resumo' },
          { value: 'exigencias', label: 'Exigências' },
          { value: 'itens', label: 'Itens' },
        ]}
      />

      {erro ? (
        <Alert color="red" title="Falha">
          {erro}
        </Alert>
      ) : carregando && !pagina ? (
        <Center py="xl">
          <Loader color="orange" />
        </Center>
      ) : pagina && pagina.data.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          Nenhuma saída de IA para o filtro.
        </Text>
      ) : (
        pagina && (
          <>
            <Table.ScrollContainer minWidth={760}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Edital</Table.Th>
                    <Table.Th>Modelo</Table.Th>
                    <Table.Th>Quando</Table.Th>
                    <Table.Th>Conferência</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pagina.data.map((e) => {
                    const chave = `${e.tipo}:${e.editalId}`;
                    return (
                      <Table.Tr key={chave}>
                        <Table.Td>
                          <Badge variant="light">{ROTULO[e.tipo]}</Badge>
                        </Table.Td>
                        <Table.Td>
                          <Anchor
                            href={`/editais/${e.editalId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                          >
                            <Group gap={4} wrap="nowrap">
                              <span>{e.editalObjeto}</span>
                              <IconExternalLink size={13} />
                            </Group>
                          </Anchor>
                          <Group gap="xs">
                            <Text size="xs" c="dimmed">
                              {e.municipio}
                            </Text>
                            <Anchor
                              component={Link}
                              to={`/admin/editais/${e.editalId}`}
                              size="xs"
                            >
                              curar
                            </Anchor>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {e.modelo ?? '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}>
                          {fmtDateTime(e.createdAt)}
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <Button
                              size="xs"
                              variant={e.veredito === 'ok' ? 'filled' : 'light'}
                              color="green"
                              loading={marcando === chave}
                              leftSection={<IconCheck size={14} />}
                              onClick={() => marcar(e, 'ok')}
                            >
                              Ok
                            </Button>
                            <Button
                              size="xs"
                              variant={
                                e.veredito === 'errado' ? 'filled' : 'light'
                              }
                              color="red"
                              loading={marcando === chave}
                              leftSection={<IconX size={14} />}
                              onClick={() => marcar(e, 'errado')}
                            >
                              Errado
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>

            {totalPaginas > 1 && (
              <Group justify="center">
                <Pagination
                  total={totalPaginas}
                  value={page}
                  onChange={setPage}
                  color="orange"
                />
              </Group>
            )}
          </>
        )
      )}
    </Stack>
  );
}
