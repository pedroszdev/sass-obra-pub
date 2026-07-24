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
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { atualizarLgpd, criarLgpd, getAdminLgpd } from '../../lib/api';
import { fmtDate, fmtDateTime } from '../../lib/format';
import {
  classificarPrazo,
  encerrada,
  LGPD_STATUS_COR,
  LGPD_STATUS_ROTULO,
  LGPD_TIPO_ROTULO,
} from '../../lib/lgpd';
import type {
  CriarLgpdInput,
  LgpdPagina,
  LgpdRequest,
  LgpdStatus,
  LgpdTipo,
} from '../../types/admin';

const TIPOS: LgpdTipo[] = [
  'acesso',
  'exportacao',
  'exclusao',
  'correcao',
  'outro',
];
const STATUS: LgpdStatus[] = [
  'aberta',
  'em_andamento',
  'atendida',
  'recusada',
];

const COR_URGENCIA = { vencido: 'red', urgente: 'orange', ok: 'gray' } as const;
const ROTULO_URGENCIA = {
  vencido: 'Prazo vencido',
  urgente: 'Prazo próximo',
  ok: 'No prazo',
} as const;

// Fila de solicitações de titular LGPD (T-196). Registra o pedido que chega por
// e-mail (fora do app), acompanha o prazo legal (15 dias) e guarda o registro do
// atendimento — a prova de conformidade do dono.
export function AdminLgpdPage() {
  const [filtro, setFiltro] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [pagina, setPagina] = useState<LgpdPagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPagina(
        await getAdminLgpd({
          status: filtro === 'todos' ? undefined : (filtro as LgpdStatus),
          page,
        }),
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtro, page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalPaginas = pagina ? Math.ceil(pagina.total / pagina.pageSize) : 0;

  return (
    <Stack>
      <div>
        <Title order={2}>LGPD — solicitações de titular</Title>
        <Text c="dimmed">
          Pedidos de acesso, exportação, correção e exclusão — inclusive os que
          chegam por e-mail, fora do app. O self-service (exportar/excluir na
          conta) cobre o titular logado; esta fila é para o resto, com o prazo
          legal e o registro do atendimento.
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          A <em>versão</em> dos termos aceita por cada conta entra com a T-179;
          hoje registramos a data do aceite, visível no detalhe da conta.
        </Text>
      </div>

      <NovaSolicitacao onCriada={carregar} />

      <SegmentedControl
        value={filtro}
        onChange={(v) => {
          setFiltro(v);
          setPage(1);
        }}
        data={[
          { value: 'todos', label: 'Todas' },
          { value: 'aberta', label: 'Abertas' },
          { value: 'em_andamento', label: 'Em andamento' },
          { value: 'atendida', label: 'Atendidas' },
          { value: 'recusada', label: 'Recusadas' },
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
          Nenhuma solicitação para o filtro.
        </Text>
      ) : (
        pagina && (
          <>
            <Stack>
              {pagina.data.map((s) => (
                <LgpdItem key={s.id} item={s} onSalvo={carregar} />
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

// Formulário de registro de uma nova solicitação (a que chegou por e-mail).
function NovaSolicitacao({ onCriada }: { onCriada: () => Promise<void> }) {
  const [tipo, setTipo] = useState<LgpdTipo>('exclusao');
  const [email, setEmail] = useState('');
  const [descricao, setDescricao] = useState('');
  const [userId, setUserId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function registrar() {
    setSalvando(true);
    setErro(null);
    try {
      const input: CriarLgpdInput = { tipo, requesterEmail: email.trim() };
      if (descricao.trim()) input.descricao = descricao.trim();
      if (userId.trim()) input.userId = userId.trim();
      await criarLgpd(input);
      setEmail('');
      setDescricao('');
      setUserId('');
      await onCriada();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card withBorder>
      <Title order={4} mb="sm">
        Registrar solicitação
      </Title>
      {erro && (
        <Alert color="red" mb="sm">
          {erro}
        </Alert>
      )}
      <Stack gap="sm">
        <Group grow align="flex-start">
          <Select
            label="Tipo"
            value={tipo}
            onChange={(v) => v && setTipo(v as LgpdTipo)}
            data={TIPOS.map((t) => ({ value: t, label: LGPD_TIPO_ROTULO[t] }))}
            allowDeselect={false}
          />
          <TextInput
            label="E-mail do titular"
            placeholder="fulano@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <TextInput
            label="ID da conta (opcional)"
            placeholder="uuid, se identificada"
            value={userId}
            onChange={(e) => setUserId(e.currentTarget.value)}
          />
        </Group>
        <Textarea
          label="Descrição (opcional)"
          placeholder="O que foi pedido, por qual canal…"
          value={descricao}
          onChange={(e) => setDescricao(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end">
          <Button
            onClick={registrar}
            loading={salvando}
            disabled={email.trim().length === 0}
          >
            Registrar
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

// Um item da fila, com edição inline de status + resolução.
function LgpdItem({
  item,
  onSalvo,
}: {
  item: LgpdRequest;
  onSalvo: () => Promise<void>;
}) {
  const [status, setStatus] = useState<LgpdStatus>(item.status);
  const [resolucao, setResolucao] = useState(item.resolucao ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const urgencia = classificarPrazo(item.prazo, encerrada(item.status));
  const sujo = status !== item.status || resolucao !== (item.resolucao ?? '');

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await atualizarLgpd(item.id, {
        status,
        resolucao: resolucao.trim() || undefined,
      });
      await onSalvo();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap="xs">
          <Badge variant="filled" color="grape">
            {LGPD_TIPO_ROTULO[item.tipo]}
          </Badge>
          <Badge variant="light" color={LGPD_STATUS_COR[item.status]}>
            {LGPD_STATUS_ROTULO[item.status]}
          </Badge>
          {urgencia && (
            <Badge variant="light" color={COR_URGENCIA[urgencia]}>
              {ROTULO_URGENCIA[urgencia]} · {fmtDate(item.prazo)}
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {fmtDateTime(item.createdAt)}
        </Text>
      </Group>

      <Group gap="lg" mb="xs">
        <Text size="sm" fw={600}>
          {item.requesterEmail}
        </Text>
        {item.userId && (
          <Anchor component={Link} to={`/admin/contas/${item.userId}`} size="xs">
            ver conta
          </Anchor>
        )}
        {item.atendidaEm && (
          <Text size="xs" c="dimmed">
            Atendida em {fmtDateTime(item.atendidaEm)}
          </Text>
        )}
      </Group>

      {item.descricao && (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} mb="sm">
          {item.descricao}
        </Text>
      )}

      {erro && (
        <Alert color="red" mb="sm">
          {erro}
        </Alert>
      )}

      <Group align="flex-end" gap="sm">
        <Select
          label="Status"
          value={status}
          onChange={(v) => v && setStatus(v as LgpdStatus)}
          data={STATUS.map((s) => ({
            value: s,
            label: LGPD_STATUS_ROTULO[s],
          }))}
          allowDeselect={false}
          w={170}
        />
        <Textarea
          label="Registro do atendimento"
          placeholder="Como foi resolvido (ou o motivo da recusa)…"
          value={resolucao}
          onChange={(e) => setResolucao(e.currentTarget.value)}
          autosize
          minRows={1}
          style={{ flex: 1 }}
        />
        <Button onClick={salvar} loading={salvando} disabled={!sujo}>
          Salvar
        </Button>
      </Group>
    </Card>
  );
}
