import {
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { getFilaClassificador, revisarClassificacao } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import type { FilaClassificadorPagina } from '../../types/admin';

// Fila de revisão do classificador (T-191). Lista as obras de BAIXA CONFIANÇA
// (classificadas só pela modalidade, favor-recall) para o dono confirmar/corrigir.
// A correção vira dataset (T-140) e ajusta a busca.
export function AdminClassificadorPage() {
  const [page, setPage] = useState(1);
  const [pagina, setPagina] = useState<FilaClassificadorPagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPagina(await getFilaClassificador(page));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function revisar(editalId: string, obra: boolean) {
    setMexendo(editalId);
    try {
      await revisarClassificacao(editalId, obra);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setMexendo(null);
    }
  }

  const totalPaginas = pagina ? Math.ceil(pagina.total / pagina.pageSize) : 0;

  return (
    <Stack>
      <div>
        <Title order={2}>Classificador</Title>
        <Text c="dimmed">
          Obras de baixa confiança (classificadas só pela modalidade, sem palavra
          de obra). Confirme ou corrija — a correção vira dataset e ajusta a busca.
        </Text>
      </div>

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
          Fila vazia — nada de baixa confiança pendente na amostra recente.
        </Text>
      ) : (
        pagina && (
          <>
            <Table.ScrollContainer minWidth={720}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Edital</Table.Th>
                    <Table.Th>Captado</Table.Th>
                    <Table.Th>Confiança</Table.Th>
                    <Table.Th>Revisão</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pagina.data.map((e) => (
                    <Table.Tr key={e.editalId}>
                      <Table.Td>
                        <Anchor
                          href={`/editais/${e.editalId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="sm"
                        >
                          <Group gap={4} wrap="nowrap">
                            <span>{e.objeto}</span>
                            <IconExternalLink size={13} />
                          </Group>
                        </Anchor>
                        <Text size="xs" c="dimmed">
                          {e.municipio} · {e.uf}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(e.createdAt)}
                      </Table.Td>
                      <Table.Td>
                        <Badge color="yellow" variant="light">
                          {e.razao}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button
                            size="xs"
                            variant="light"
                            color="green"
                            loading={mexendo === e.editalId}
                            onClick={() => revisar(e.editalId, true)}
                          >
                            É obra
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            color="red"
                            loading={mexendo === e.editalId}
                            onClick={() => revisar(e.editalId, false)}
                          >
                            Não é obra
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
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
