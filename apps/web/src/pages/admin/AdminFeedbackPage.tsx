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
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { atualizarStatusFeedback, getAdminFeedback } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { FeedbackPagina, FeedbackStatus } from '../../types/admin';

const COR: Record<FeedbackStatus, string> = {
  novo: 'orange',
  lido: 'blue',
  resolvido: 'green',
};

// Fila de feedback/bug do beta (T-202). Fecha o ciclo do relatório de QA: agora o
// sinal chega sozinho, de dentro do app.
export function AdminFeedbackPage() {
  const [filtro, setFiltro] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [pagina, setPagina] = useState<FeedbackPagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await getAdminFeedback({
        status: filtro === 'todos' ? undefined : (filtro as FeedbackStatus),
        page,
      });
      setPagina(r);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtro, page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function mudar(id: string, status: FeedbackStatus) {
    setMexendo(id);
    try {
      await atualizarStatusFeedback(id, status);
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
        <Title order={2}>Feedback</Title>
        <Text c="dimmed">Problemas reportados pelos usuários, de dentro do app.</Text>
      </div>

      <SegmentedControl
        value={filtro}
        onChange={(v) => {
          setFiltro(v);
          setPage(1);
        }}
        data={[
          { value: 'todos', label: 'Todos' },
          { value: 'novo', label: 'Novos' },
          { value: 'lido', label: 'Lidos' },
          { value: 'resolvido', label: 'Resolvidos' },
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
          Nenhum feedback para o filtro.
        </Text>
      ) : (
        pagina && (
          <>
            <Stack>
              {pagina.data.map((f) => (
                <Card key={f.id} withBorder>
                  <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                      <Badge color={COR[f.status]} variant="light">
                        {f.status}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {fmtDateTime(f.createdAt)}
                      </Text>
                    </Group>
                    <Group gap="xs">
                      {f.status !== 'lido' && (
                        <Button
                          size="xs"
                          variant="light"
                          loading={mexendo === f.id}
                          onClick={() => mudar(f.id, 'lido')}
                        >
                          Marcar lido
                        </Button>
                      )}
                      {f.status !== 'resolvido' && (
                        <Button
                          size="xs"
                          variant="light"
                          color="green"
                          loading={mexendo === f.id}
                          onClick={() => mudar(f.id, 'resolvido')}
                        >
                          Resolver
                        </Button>
                      )}
                    </Group>
                  </Group>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{f.mensagem}</Text>
                  <Group gap="lg" mt="sm">
                    <Text size="xs" c="dimmed">
                      Tela: {f.rota ?? '—'}
                    </Text>
                    {f.versao && (
                      <Text size="xs" c="dimmed">
                        Versão: {f.versao}
                      </Text>
                    )}
                    <Anchor
                      component={Link}
                      to={`/admin/contas/${f.userId}`}
                      size="xs"
                    >
                      ver conta
                    </Anchor>
                  </Group>
                </Card>
              ))}
            </Stack>

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
