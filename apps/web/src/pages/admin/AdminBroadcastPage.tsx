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
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  enviarBroadcast,
  getBroadcasts,
  previewBroadcast,
} from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type {
  BroadcastPagina,
  BroadcastSegmento,
} from '../../types/admin';

const SEGMENTOS: { value: BroadcastSegmento; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'trial', label: 'Em trial' },
  { value: 'pagantes', label: 'Pagantes' },
];

// Comunicado ao beta (T-198): e-mail segmentado, com histórico das campanhas. O
// status por destinatário fica na tela "E-mails" (mail_log).
export function AdminBroadcastPage() {
  const [page, setPage] = useState(1);
  const [pagina, setPagina] = useState<BroadcastPagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setPagina(await getBroadcasts(page));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalPaginas = pagina ? Math.ceil(pagina.total / pagina.pageSize) : 0;

  return (
    <Stack>
      <div>
        <Title order={2}>Comunicado ao beta</Title>
        <Text c="dimmed">
          E-mail para um segmento das contas. Vai só para quem tem e-mail
          verificado. O status de cada envio aparece na aba E-mails.
        </Text>
      </div>

      <Compositor onEnviado={carregar} />

      {erro && (
        <Alert color="red" title="Falha">
          {erro}
        </Alert>
      )}

      <Title order={4}>Histórico</Title>
      {carregando && !pagina ? (
        <Center py="xl">
          <Loader color="orange" />
        </Center>
      ) : pagina && pagina.data.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          Nenhum comunicado enviado ainda.
        </Text>
      ) : (
        pagina && (
          <>
            <Stack>
              {pagina.data.map((b) => (
                <Card key={b.id} withBorder>
                  <Group justify="space-between" mb={4}>
                    <Group gap="xs">
                      <Badge variant="light" color="grape">
                        {SEGMENTOS.find((s) => s.value === b.segmento)?.label ??
                          b.segmento}
                      </Badge>
                      <Badge
                        variant="light"
                        color={b.status === 'concluido' ? 'green' : 'orange'}
                      >
                        {b.status}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {b.total} destinatário(s) · {fmtDateTime(b.createdAt)}
                      </Text>
                    </Group>
                    <Anchor component={Link} to="/admin/emails" size="xs">
                      ver envios
                    </Anchor>
                  </Group>
                  <Text fw={600}>{b.assunto}</Text>
                  <Text
                    size="sm"
                    c="dimmed"
                    lineClamp={2}
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {b.corpo}
                  </Text>
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

function Compositor({ onEnviado }: { onEnviado: () => Promise<void> }) {
  const [segmento, setSegmento] = useState<BroadcastSegmento>('todos');
  const [assunto, setAssunto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  useEffect(() => {
    let vivo = true;
    setTotal(null);
    previewBroadcast(segmento)
      .then((r) => vivo && setTotal(r.total))
      .catch(() => vivo && setTotal(null));
    return () => {
      vivo = false;
    };
  }, [segmento]);

  async function enviar() {
    if (
      !window.confirm(
        `Enviar este comunicado para ${total ?? '?'} destinatário(s)? Não dá para desfazer.`,
      )
    ) {
      return;
    }
    setEnviando(true);
    setAviso(null);
    try {
      await enviarBroadcast({ segmento, assunto: assunto.trim(), corpo });
      setAssunto('');
      setCorpo('');
      setAviso({ ok: true, texto: 'Comunicado disparado.' });
      await onEnviado();
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  const podeEnviar = assunto.trim().length >= 3 && corpo.trim().length >= 3;

  return (
    <Card withBorder>
      <Title order={4} mb="sm">
        Novo comunicado
      </Title>
      {aviso && (
        <Alert color={aviso.ok ? 'green' : 'red'} mb="sm">
          {aviso.texto}
        </Alert>
      )}
      <Stack gap="sm">
        <div>
          <Text size="sm" fw={500} mb={4}>
            Segmento
          </Text>
          <SegmentedControl
            value={segmento}
            onChange={(v) => setSegmento(v as BroadcastSegmento)}
            data={SEGMENTOS}
          />
          <Text size="xs" c="dimmed" mt={4}>
            {total == null
              ? 'Calculando destinatários…'
              : `Vai para ${total} destinatário(s) com e-mail verificado.`}
          </Text>
        </div>
        <TextInput
          label="Assunto"
          value={assunto}
          onChange={(e) => setAssunto(e.currentTarget.value)}
          maxLength={200}
        />
        <Textarea
          label="Mensagem"
          placeholder="Escreva o comunicado. Linhas em branco viram parágrafos."
          value={corpo}
          onChange={(e) => setCorpo(e.currentTarget.value)}
          autosize
          minRows={5}
          maxLength={5000}
        />
        <Group justify="flex-end">
          <Button
            onClick={enviar}
            loading={enviando}
            disabled={!podeEnviar || total === 0}
          >
            Enviar comunicado
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
