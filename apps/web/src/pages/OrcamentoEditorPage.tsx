import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Progress,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconChevronDown,
  IconCircleCheck,
  IconClipboardText,
  IconDownload,
  IconFileSpreadsheet,
  IconCheck,
  IconPlus,
  IconPrinter,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingCards } from '../components/StateViews';
import {
  addPropostaItem,
  addPropostaItensBulk,
  ApiError,
  deletePropostaItem,
  downloadPropostaCsv,
  getEdital,
  getProposta,
  importarItensDoEdital,
  updateProposta,
  updatePropostaItem,
} from '../lib/api';
import { brl, brlCompact, daysUntil, fmtDateTime } from '../lib/format';
import { parseItensColados } from '../lib/parse-itens';
import { encurtarObjeto } from '../lib/objeto';
import classes from '../styles/cards.module.css';
import type { EditalDetail } from '../types/edital';
import type {
  CreatePropostaItemInput,
  PropostaDetail,
  PropostaStatus,
} from '../types/proposta';

const STATUS: Record<PropostaStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'orange' },
  enviada: { label: 'Enviada', color: 'aco' },
  ganhou: { label: 'Ganhou', color: 'apto' },
  nao_ganhou: { label: 'Não ganhou', color: 'alerta' },
};

const TH = {
  th: {
    fontFamily: 'var(--mantine-font-family-monospace)',
    textTransform: 'uppercase' as const,
    fontSize: '0.7rem',
    letterSpacing: '0.06em',
    fontWeight: 500,
    color: 'var(--mantine-color-graphite-5)',
  },
};

type State =
  | { status: 'loading' }
  | { status: 'success'; data: PropostaDetail }
  | { status: 'notfound' }
  | { status: 'error'; message: string };

// Converte "1.234,56" (pt-BR) ou "1234.56" em number; vazio → null.
// Modal de inclusão manual (T-65): um item por formulário ou colar vários.
function AddItensModal({
  opened,
  onClose,
  onAddOne,
  onAddMany,
  initialTab,
}: {
  opened: boolean;
  onClose: () => void;
  onAddOne: (input: CreatePropostaItemInput) => Promise<void>;
  onAddMany: (itens: CreatePropostaItemInput[]) => Promise<void>;
  initialTab: 'um' | 'colar';
}) {
  const [descricao, setDescricao] = useState('');
  const [unidade, setUnidade] = useState('');
  const [quantidade, setQuantidade] = useState<number | string>('');
  const [preco, setPreco] = useState<number | string>('');
  const [colar, setColar] = useState('');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function reset() {
    setDescricao('');
    setUnidade('');
    setQuantidade('');
    setPreco('');
    setColar('');
    setErro(null);
  }

  async function submitOne() {
    if (!descricao.trim()) {
      setErro('Descreva o item.');
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      await onAddOne({
        descricao: descricao.trim(),
        unidade: unidade.trim() || null,
        quantidade: quantidade === '' ? null : Number(quantidade),
        precoUnitario: preco === '' ? null : Number(preco),
      });
      reset();
      onClose();
    } catch {
      setErro('Não foi possível adicionar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  // Cada linha: descrição [TAB|;|2+ espaços] unidade qtd preço.
  async function submitMany() {
    const itens = parseItensColados(colar);
    if (itens.length === 0) {
      setErro('Cole ao menos uma linha com descrição.');
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      await onAddMany(itens);
      reset();
      onClose();
    } catch {
      setErro('Não foi possível adicionar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Adicionar item" centered radius="md">
      <Tabs key={initialTab} defaultValue={initialTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="um">Um item</Tabs.Tab>
          <Tabs.Tab value="colar">Colar vários</Tabs.Tab>
        </Tabs.List>

        {erro && (
          <Alert color="alerta" variant="light" mb="sm">
            {erro}
          </Alert>
        )}

        <Tabs.Panel value="um">
          <Stack gap="sm">
            <TextInput
              label="Descrição do serviço"
              value={descricao}
              onChange={(e) => setDescricao(e.currentTarget.value)}
              required
            />
            <Group grow>
              <TextInput
                label="Unidade"
                placeholder="m², vb, kg…"
                value={unidade}
                onChange={(e) => setUnidade(e.currentTarget.value)}
              />
              <NumberInput
                label="Quantidade"
                value={quantidade}
                onChange={setQuantidade}
                min={0}
                decimalScale={4}
                thousandSeparator="."
                decimalSeparator=","
              />
              <NumberInput
                label="Preço unit. (R$)"
                value={preco}
                onChange={setPreco}
                min={0}
                decimalScale={2}
                thousandSeparator="."
                decimalSeparator=","
              />
            </Group>
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button color="orange" onClick={submitOne} loading={saving}>
                Adicionar
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="colar">
          <Stack gap="sm">
            <Text fz={12.5} c="dimmed">
              Uma linha por item. Separe descrição, unidade, quantidade e preço por TAB
              (colando da planilha) ou ponto-e-vírgula.
            </Text>
            <Textarea
              autosize
              minRows={6}
              placeholder={'Demolição de alvenaria\tm²\t120\t35,50\nLastro de brita\tm³\t40\t90'}
              value={colar}
              onChange={(e) => setColar(e.currentTarget.value)}
            />
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button color="orange" onClick={submitMany} loading={saving}>
                Adicionar itens
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

export function OrcamentoEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [precos, setPrecos] = useState<Record<string, number | string>>({});
  const [bdi, setBdi] = useState<number | string>('');
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Erro de salvamento (T-105): o caminho crítico (preço/BDI/status/cronograma)
  // não pode falhar em silêncio — mostra a mensagem do backend.
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Qual aba o modal de item abre: "colar" (planilha) ou "um" (item avulso).
  const [addTab, setAddTab] = useState<'um' | 'colar'>('um');
  function abrirAdd(tab: 'um' | 'colar') {
    setAddTab(tab);
    setAddOpen(true);
  }
  // Dados do edital (município/UF, prazo) — não vêm no detalhe da proposta.
  // Falha silenciosa de propósito: o editor funciona sem eles.
  const [edital, setEdital] = useState<EditalDetail | null>(null);
  // Instante do último salvamento BEM-SUCEDIDO. Só aparece depois de existir de
  // fato — nada de "salvo automaticamente" antes de ter salvo alguma coisa.
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);

  // Carrega/recarrega o detalhe (com os totais do backend, §3.3).
  async function carregar(signal?: AbortSignal): Promise<void> {
    if (!id) return;
    try {
      const data = await getProposta(id, signal);
      if (signal?.aborted) return;
      setState({ status: 'success', data });
      setBdi(data.bdiPercentual ?? '');
      getEdital(data.editalId, signal)
        .then((e) => !signal?.aborted && setEdital(e))
        .catch(() => {
          /* sem edital: cabeçalho e prazo simplesmente não aparecem */
        });
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: 'notfound' });
        return;
      }
      setState({
        status: 'error',
        message:
          err instanceof ApiError ? err.message : 'Não foi possível carregar o orçamento.',
      });
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void carregar(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Recarrega só os totais/itens depois de salvar (mantém o que o usuário digita).
  async function recarregarTotais(): Promise<void> {
    if (!id) return;
    const data = await getProposta(id);
    setState({ status: 'success', data });
  }

  // Envolve um salvamento: sinaliza "salvando", e em falha mostra a mensagem do
  // backend (ex.: "Proposta fora de rascunho é somente leitura") em vez de falhar
  // em silêncio (T-105).
  async function comSalvamento(fn: () => Promise<void>): Promise<void> {
    setSalvando(true);
    setErroSalvar(null);
    try {
      await fn();
      setSalvoEm(new Date());
    } catch (err) {
      setErroSalvar(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível salvar. Verifique a conexão e tente de novo.',
      );
    } finally {
      setSalvando(false);
    }
  }

  async function salvarPreco(itemId: string): Promise<void> {
    if (!id) return;
    const valor = precos[itemId];
    const preco = valor === '' || valor == null ? null : Number(valor);
    await comSalvamento(async () => {
      await updatePropostaItem(id, itemId, { precoUnitario: preco });
      await recarregarTotais();
    });
  }

  async function salvarBdi(): Promise<void> {
    if (!id) return;
    const valor = bdi === '' || bdi == null ? 0 : Number(bdi);
    await comSalvamento(async () => {
      await updateProposta(id, { bdiPercentual: valor });
      await recarregarTotais();
    });
  }

  async function importar(): Promise<void> {
    if (!id) return;
    setImportando(true);
    setAviso(null);
    try {
      const r = await importarItensDoEdital(id);
      setState({ status: 'success', data: r.proposta });
      setAviso(
        r.importados > 0
          ? `${r.importados} ${r.importados === 1 ? 'item importado' : 'itens importados'} do edital. Preencha os preços.`
          : 'O edital não tem planilha extraível por IA — adicione os itens manualmente.',
      );
    } catch (err) {
      // 409 (T-117d): a proposta já tem itens — importar de novo duplicaria.
      if (err instanceof ApiError && err.status === 409) {
        setAviso('Esta proposta já tem itens; importe só em proposta vazia para não duplicar.');
      } else {
        setAviso('Não foi possível importar do edital agora. Tente de novo ou adicione manual.');
      }
    } finally {
      setImportando(false);
    }
  }

  async function removerItem(itemId: string): Promise<void> {
    if (!id) return;
    await comSalvamento(async () => {
      await deletePropostaItem(id, itemId);
      setPrecos((p) => {
        const resto = { ...p };
        delete resto[itemId];
        return resto;
      });
      await recarregarTotais();
    });
  }

  // Sem comSalvamento aqui de propósito: o AddItemModal trata o erro (mantém o
  // modal aberto + mensagem) contando com a REJEIÇÃO desta promise (T-105).
  async function adicionarUm(input: CreatePropostaItemInput): Promise<void> {
    if (!id) return;
    await addPropostaItem(id, input);
    await recarregarTotais();
  }

  async function adicionarVarios(itens: CreatePropostaItemInput[]): Promise<void> {
    if (!id) return;
    const data = await addPropostaItensBulk(id, itens);
    setState({ status: 'success', data });
  }

  async function mudarStatus(novo: PropostaStatus): Promise<void> {
    if (!id) return;
    await comSalvamento(async () => {
      await updateProposta(id, { status: novo });
      await recarregarTotais();
    });
  }

  async function salvarCronograma(
    etapas: { descricao: string; percentual: number }[],
  ): Promise<void> {
    if (!id) return;
    await comSalvamento(async () => {
      await updateProposta(id, { cronograma: etapas });
      await recarregarTotais();
    });
  }

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={1140} mx="auto">
        <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
          <Button
            component={Link}
            to="/orcamentos"
            variant="subtle"
            color="orange"
            size="compact-sm"
            px={0}
            leftSection={<IconArrowLeft size={16} />}
          >
            Voltar para orçamentos
          </Button>
          {salvando && (
            <Group gap={6} c="dimmed">
              <Loader size="xs" />
              <Text fz={12}>Salvando…</Text>
            </Group>
          )}
        </Group>

        {state.status === 'loading' && <LoadingCards count={1} />}

        {state.status === 'notfound' && (
          <EmptyState
            title="Orçamento não encontrado."
            actionLabel="Voltar para orçamentos"
            onAction={() => navigate('/orcamentos')}
          />
        )}

        {state.status === 'error' && (
          <ErrorState
            title="Não foi possível carregar o orçamento."
            description={state.message}
            onRetry={() => void carregar()}
          />
        )}

        {state.status === 'success' && (
          <Editor
            data={state.data}
            edital={edital}
            salvoEm={salvoEm}
            precos={precos}
            setPrecos={setPrecos}
            bdi={bdi}
            setBdi={setBdi}
            onSalvarPreco={salvarPreco}
            onSalvarBdi={salvarBdi}
            onImportar={importar}
            importando={importando}
            onRemover={removerItem}
            onAbrirAdd={abrirAdd}
            onMudarStatus={mudarStatus}
            onSalvarCronograma={salvarCronograma}
            aviso={aviso}
            erroSalvar={erroSalvar}
          />
        )}
      </Box>

      <AddItensModal
        opened={addOpen}
        onClose={() => setAddOpen(false)}
        onAddOne={adicionarUm}
        onAddMany={adicionarVarios}
        initialTab={addTab}
      />
    </Box>
  );
}

// Ações de transição de status (T-84), contextuais ao status atual:
// rascunho → enviada → ganhou | nao_ganhou (com reabertura de um passo).
// Prazo do edital, do lado do título (o mock chama de "proposta encerra em").
// Sem edital carregado ou sem prazo, some — não inventamos data.
function PrazoCard({ prazo }: { prazo: string | null }) {
  if (!prazo) return null;
  const dias = daysUntil(prazo);
  if (!Number.isFinite(dias)) return null;
  const encerrado = dias < 0;
  const urgente = !encerrado && dias <= 5;

  return (
    <Card radius="lg" p="md" bg="graphite.9" c="concreto.2">
      <Text className="brand-label" c="concreto.6" fz={10}>
        Proposta encerra em
      </Text>
      <Text
        fz={26}
        fw={800}
        lh={1.1}
        mt={2}
        c={encerrado ? 'alerta.5' : urgente ? 'alerta.4' : 'orange.5'}
      >
        {encerrado ? 'Encerrado' : dias === 0 ? 'Hoje' : `${dias} dias`}
      </Text>
      <Text fz={11.5} c="concreto.6" mt={2}>
        {fmtDateTime(prazo)}
      </Text>
    </Card>
  );
}

// Trilha do trabalho. Tudo derivado do que o backend já calcula — nenhum estado
// novo, nada persistido: se a planilha tem itens, o passo 1 está feito.
function Passos({
  calculo,
  cronogramaTotal,
}: {
  calculo: PropostaDetail['calculo'];
  cronogramaTotal: number;
}) {
  const temItens = calculo.totalItens > 0;
  const precificados = calculo.totalItens - calculo.itensSemPreco;
  const precosOk = temItens && calculo.itensSemPreco === 0;
  const cronogramaOk = cronogramaTotal === 100;

  const passos = [
    { n: 1, label: 'Planilha importada', feito: temItens },
    {
      n: 2,
      label: temItens
        ? `Preços — ${precificados} de ${calculo.totalItens}`
        : 'Preços',
      feito: precosOk,
    },
    { n: 3, label: 'Cronograma', feito: cronogramaOk },
    { n: 4, label: 'Exportar', feito: false },
  ];
  // O passo ativo é o primeiro não concluído.
  const ativo = passos.find((p) => !p.feito)?.n ?? 4;

  return (
    <Group gap="xs" wrap="wrap">
      {passos.map((p) => {
        const atual = p.n === ativo;
        return (
          <Group
            key={p.n}
            gap={7}
            wrap="nowrap"
            px={12}
            py={6}
            style={{
              borderRadius: 999,
              border: `1px solid var(--mantine-color-${p.feito ? 'apto-2' : atual ? 'orange-3' : 'concreto-4'})`,
              backgroundColor: p.feito
                ? 'var(--mantine-color-apto-0)'
                : atual
                  ? 'var(--mantine-color-orange-0)'
                  : 'transparent',
            }}
          >
            {p.feito ? (
              <IconCheck size={13} color="var(--mantine-color-apto-8)" stroke={3} />
            ) : (
              <Text fz={11} fw={700} c={atual ? 'orange.8' : 'dimmed'}>
                {p.n}
              </Text>
            )}
            <Text fz={12.5} fw={atual || p.feito ? 600 : 400} c={p.feito ? 'apto.8' : atual ? 'orange.8' : 'dimmed'}>
              {p.label}
            </Text>
          </Group>
        );
      })}
    </Group>
  );
}

function StatusAcoes({
  status,
  onMudar,
}: {
  status: PropostaStatus;
  onMudar: (novo: PropostaStatus) => void;
}) {
  if (status === 'rascunho') {
    return (
      <Button color="orange" size="sm" fullWidth onClick={() => onMudar('enviada')}>
        Marcar como enviada
      </Button>
    );
  }
  if (status === 'enviada') {
    return (
      <>
        <Button color="apto" size="sm" fullWidth onClick={() => onMudar('ganhou')}>
          Ganhou
        </Button>
        <Button variant="default" size="sm" fullWidth onClick={() => onMudar('nao_ganhou')}>
          Não ganhou
        </Button>
        <Button variant="subtle" color="gray" size="sm" fullWidth onClick={() => onMudar('rascunho')}>
          Voltar a rascunho
        </Button>
      </>
    );
  }
  // ganhou | nao_ganhou: resultado registrado — só permite reabrir.
  return (
    <Button variant="default" size="sm" fullWidth onClick={() => onMudar('enviada')}>
      Reabrir resultado
    </Button>
  );
}

function Editor({
  data,
  precos,
  setPrecos,
  bdi,
  setBdi,
  onSalvarPreco,
  onSalvarBdi,
  onImportar,
  importando,
  onRemover,
  onAbrirAdd,
  onMudarStatus,
  onSalvarCronograma,
  aviso,
  erroSalvar,
  edital,
  salvoEm,
}: {
  data: PropostaDetail;
  precos: Record<string, number | string>;
  setPrecos: Dispatch<SetStateAction<Record<string, number | string>>>;
  bdi: number | string;
  setBdi: (v: number | string) => void;
  onSalvarPreco: (itemId: string) => void;
  onSalvarBdi: () => void;
  onImportar: () => void;
  importando: boolean;
  onRemover: (itemId: string) => void;
  onAbrirAdd: (tab: 'um' | 'colar') => void;
  onMudarStatus: (novo: PropostaStatus) => void;
  onSalvarCronograma: (etapas: { descricao: string; percentual: number }[]) => void;
  aviso: string | null;
  erroSalvar: string | null;
  edital: EditalDetail | null;
  salvoEm: Date | null;
}) {
  const c = data.calculo;
  const comp = c.comparacao;
  // Trava de edição fora de rascunho (T-117b): itens/BDI/import só em rascunho —
  // o backend recusa; aqui desabilitamos os controles e explicamos como reabrir.
  const editavel = data.status === 'rascunho';

  return (
    <Stack gap="lg">
      {/* O "voltar para orçamentos" já existe no topo da página — não duplicar. */}
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="lg">
        <Box style={{ minWidth: 0 }}>
          <Group gap="sm" align="center" mb={6}>
            <Badge color={STATUS[data.status].color} variant="outline" radius="xl" tt="none">
              {STATUS[data.status].label}
            </Badge>
            {/* Só aparece depois de um salvamento real — o editor salva ao sair
                do campo, então "automaticamente" é literal, não promessa. */}
            {salvoEm && (
              <Text fz={12} c="dimmed">
                salvo automaticamente às{' '}
                {salvoEm.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            )}
          </Group>

          {/* O título da proposta nasce do objeto do edital (T-71), então herda
              o mesmo preâmbulo burocrático — encurtamos aqui também. */}
          <Title order={1} fz={24} lineClamp={2} style={{ letterSpacing: '-0.01em' }}>
            {encurtarObjeto(data.titulo)}
          </Title>

          <Text fz={13} c="dimmed" mt={4}>
            {edital && `${edital.municipioNome} · ${edital.uf} · `}
            Teto <b>{brl(data.valorReferencia)}</b> ·{' '}
            <Anchor component={Link} to={`/editais/${data.editalId}`} fz={13}>
              Ver edital completo
            </Anchor>
          </Text>
        </Box>

        {/* Coluna de largura fixa: o card de prazo e as ações de status esticam
            para ocupá-la, ficando com a mesma largura (align stretch do Stack). */}
        <Stack gap="sm" w={208} style={{ flex: 'none' }}>
          <PrazoCard prazo={edital?.prazoProposta ?? null} />
          <StatusAcoes status={data.status} onMudar={onMudarStatus} />
        </Stack>
      </Group>

      <Passos calculo={c} cronogramaTotal={data.cronogramaPercentualTotal} />

      {aviso && (
        <Alert color="orange" variant="light" radius="md">
          {aviso}
        </Alert>
      )}

      {erroSalvar && (
        <Alert color="alerta" variant="light" radius="md" title="Não salvou">
          {erroSalvar}
        </Alert>
      )}

      {!editavel && (
        <Alert color="gray" variant="light" radius="md">
          Proposta {STATUS[data.status].label.toLowerCase()} — somente leitura.
          Para editar itens, preços ou BDI, volte a proposta para rascunho.
        </Alert>
      )}

      <Flex2>
        {/* coluna principal: planilha de itens */}
        <Card withBorder radius="lg" p={0} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {data.itens.length === 0 ? (
            <Box p="xl">
              <Stack align="center" gap="xs">
                <ThemeIcon variant="light" color="orange" radius="xl" size={48}>
                  <IconSparkles size={24} />
                </ThemeIcon>
                <Text fw={600}>Monte a planilha de preços</Text>
                <Text c="dimmed" fz="sm" ta="center" maw={460}>
                  Importe os itens da planilha do edital com IA ou adicione à mão. Depois é
                  só preencher os preços.
                </Text>
                <Group mt="sm">
                  <Button
                    color="orange"
                    leftSection={<IconSparkles size={16} />}
                    onClick={onImportar}
                    loading={importando}
                    disabled={!editavel}
                  >
                    Importar do edital
                  </Button>
                  <Button
                    variant="default"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => onAbrirAdd('um')}
                    disabled={!editavel}
                  >
                    Adicionar item
                  </Button>
                </Group>
              </Stack>
            </Box>
          ) : (
            <>
              <Group justify="space-between" p="md" pb="xs" align="flex-start" wrap="nowrap">
                <Box>
                  <Text fw={700} fz={15}>
                    Planilha de preços
                  </Text>
                  <Text fz={12.5} c="dimmed" mt={2}>
                    {data.itens.length}{' '}
                    {data.itens.length === 1 ? 'item' : 'itens'} ·{' '}
                    <Anchor component={Link} to={`/editais/${data.editalId}`} fz={12.5}>
                      conferir origem
                    </Anchor>
                  </Text>
                </Box>
                <Group gap="xs" wrap="nowrap">
                  <Button
                    variant="default"
                    size="xs"
                    leftSection={<IconClipboardText size={15} />}
                    onClick={() => onAbrirAdd('colar')}
                    disabled={!editavel}
                  >
                    Colar planilha
                  </Button>
                  <Button
                    variant="default"
                    size="xs"
                    leftSection={<IconPlus size={15} />}
                    onClick={() => onAbrirAdd('um')}
                    disabled={!editavel}
                  >
                    Item
                  </Button>
                </Group>
              </Group>
              <Table.ScrollContainer minWidth={560}>
                <Table verticalSpacing="sm" horizontalSpacing="md" styles={TH}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Item</Table.Th>
                      <Table.Th w={90} ta="right">Qtde.</Table.Th>
                      <Table.Th w={150} ta="right">Preço unit.</Table.Th>
                      <Table.Th w={130} ta="right">Subtotal</Table.Th>
                      <Table.Th w={40} aria-label="Ações" />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.itens.map((item, i) => {
                      const sub = c.itens[i]?.subtotal ?? 0;
                      const semPreco = c.itens[i]?.semPreco ?? true;
                      const val =
                        precos[item.id] !== undefined
                          ? precos[item.id]
                          : (item.precoUnitario ?? '');
                      return (
                        <Table.Tr key={item.id} className={classes.itemRow}>
                          <Table.Td>
                            <Text fz={13.5} fw={600} ff="heading" lh={1.3}>
                              {item.descricao}
                            </Text>
                            {item.unidade && (
                              <Text fz={11.5} c="dimmed" mt={1}>
                                {item.unidade}
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Text fz={13} ff="monospace" c="dimmed" ta="right">
                              {item.quantidade == null
                                ? '—'
                                : item.quantidade.toLocaleString('pt-BR')}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <NumberInput
                              size="xs"
                              value={val}
                              onChange={(v) =>
                                setPrecos((p) => ({ ...p, [item.id]: v }))
                              }
                              onBlur={() => onSalvarPreco(item.id)}
                              min={0}
                              decimalScale={2}
                              thousandSeparator="."
                              decimalSeparator=","
                              hideControls
                              disabled={!editavel}
                              placeholder="preencher"
                              prefix="R$ "
                              variant="unstyled"
                              styles={{
                                input: {
                                  textAlign: 'right',
                                  fontFamily: 'var(--mantine-font-family-monospace)',
                                  fontSize: 13,
                                  borderBottom: semPreco
                                    ? '1px dashed var(--mantine-color-orange-4)'
                                    : '1px solid transparent',
                                  color: semPreco
                                    ? 'var(--mantine-color-orange-8)'
                                    : undefined,
                                },
                              }}
                            />
                          </Table.Td>
                          <Table.Td>
                            <Text
                              fz={13}
                              fw={600}
                              ff="monospace"
                              ta="right"
                              c={semPreco ? 'dimmed' : undefined}
                            >
                              {semPreco ? '—' : brl(sub)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <ActionIcon
                              className={classes.itemAction}
                              variant="subtle"
                              color="gray"
                              aria-label="Remover item"
                              onClick={() => onRemover(item.id)}
                              disabled={!editavel}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <Group
                justify="space-between"
                p="md"
                gap="sm"
                wrap="wrap"
                style={{ borderTop: '1px solid var(--mantine-color-concreto-3)' }}
              >
                <Text fz={12.5} c={c.itensSemPreco > 0 ? 'orange.8' : 'dimmed'} fw={c.itensSemPreco > 0 ? 600 : 400}>
                  {c.itensSemPreco > 0
                    ? `${c.itensSemPreco} ${c.itensSemPreco === 1 ? 'item sem preço' : 'itens sem preço'} — preencha para liberar a exportação`
                    : 'Todos os itens com preço.'}
                </Text>
                <Text fz={13} fw={600}>
                  Custo direto: {brl(c.custoDireto)}
                </Text>
              </Group>
            </>
          )}
        </Card>

        {/* sidebar: composição da proposta (totais do backend) */}
        <Box w={{ base: '100%', md: 320 }} style={{ flex: 'none' }}>
          <Card radius="lg" p="lg" bg="graphite.9" c="concreto.2">
            <Text className="brand-label" c="concreto.5" mb="md">
              Composição da proposta
            </Text>

            <Group align="flex-end" gap="sm" mb="md" wrap="nowrap">
              <NumberInput
                label="BDI (%)"
                value={bdi}
                onChange={setBdi}
                onBlur={onSalvarBdi}
                min={0}
                max={999.99}
                decimalScale={2}
                decimalSeparator=","
                hideControls
                disabled={!editavel}
                w={110}
                styles={{ label: { color: 'var(--mantine-color-concreto-4)', fontSize: 12 } }}
              />
              {/* ⚠️ Afirmação de PRODUTO, não dado calculado: não medimos o BDI do
                  setor e não há fonte no código. Mantida por decisão do dono. Se
                  virar número oficial, a referência é o Acórdão 2622/2013-TCU. */}
              <Text fz={11.5} c="concreto.6" pb={8}>
                média do setor: 22–28%
              </Text>
            </Group>

            <Linha rotulo="Custo direto" valor={brl(c.custoDireto)} />
            <Linha rotulo={`BDI (${c.bdiPercentual}%)`} valor={brl(c.valorBdi)} />

            <Box mt="md" pt="md" style={{ borderTop: '1px solid var(--mantine-color-graphite-7)' }}>
              <Text className="brand-label" c="concreto.6">
                Valor global
              </Text>
              <Text fz={28} fw={800} c="orange.5" lh={1.1}>
                {brl(c.valorGlobal)}
              </Text>
              {comp && (
                <>
                  <Text fz={12} c={comp.abaixoDoTeto ? 'apto.5' : 'alerta.5'} mt={4}>
                    {comp.abaixoDoTeto
                      ? `${comp.diferencaPercentual}% abaixo do teto · folga de ${brlCompact(comp.economia)}`
                      : `${Math.abs(comp.diferencaPercentual)}% acima do teto · ${brlCompact(Math.abs(comp.economia))} acima`}
                  </Text>
                  <Progress
                    value={Math.min(comp.percentualDoTeto, 100)}
                    color={comp.abaixoDoTeto ? 'apto' : 'alerta'}
                    radius="xl"
                    size="sm"
                    mt={6}
                  />
                </>
              )}
            </Box>

            {c.itensIncompletos > 0 && (
              <Text fz={12} c="alerta.5" fw={600} mt="xs">
                ⚠ {c.itensIncompletos}{' '}
                {c.itensIncompletos === 1
                  ? 'item tem preço mas está sem quantidade'
                  : 'itens têm preço mas estão sem quantidade'}{' '}
                — somam R$ 0 e a proposta sai subestimada.
              </Text>
            )}

            {/* Exportar com item sem preço geraria uma proposta subestimada —
                o mesmo risco que a T-117(a) atacou no cálculo. Trava e explica. */}
            <Menu position="bottom" withinPortal disabled={c.itensSemPreco > 0}>
              <Menu.Target>
                <Button
                  fullWidth
                  color="orange"
                  mt="lg"
                  disabled={c.itensSemPreco > 0}
                  leftSection={<IconDownload size={16} />}
                  rightSection={<IconChevronDown size={14} />}
                >
                  Exportar proposta
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconFileSpreadsheet size={16} />}
                  onClick={() =>
                    void downloadPropostaCsv(data.id, `proposta-${data.id}.csv`)
                  }
                >
                  Baixar Excel (.csv)
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconPrinter size={16} />}
                  component={Link}
                  to={`/orcamentos/${data.id}/imprimir`}
                >
                  Imprimir / PDF
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            {c.itensSemPreco > 0 && (
              <Text fz={11.5} c="concreto.6" ta="center" mt={8}>
                preencha {c.itensSemPreco === 1 ? 'o item restante' : `os ${c.itensSemPreco} itens restantes`}{' '}
                para exportar
              </Text>
            )}
          </Card>
        </Box>
      </Flex2>

      <CronogramaEditor
        data={data}
        onSalvar={onSalvarCronograma}
        editavel={editavel}
      />
    </Stack>
  );
}

// Cronograma físico-financeiro simples (T-93): etapas com descrição + % do valor
// global. O valor por etapa é derivado no backend (§3.3) — o front só edita o %
// e renderiza o valor que volta. "Salvar" persiste o conjunto e recarrega.
type EtapaEdit = { descricao: string; percentual: number | string };

function CronogramaEditor({
  data,
  onSalvar,
  editavel,
}: {
  data: PropostaDetail;
  onSalvar: (etapas: { descricao: string; percentual: number }[]) => void;
  editavel: boolean;
}) {
  const [etapas, setEtapas] = useState<EtapaEdit[]>(() =>
    data.cronograma.map((e) => ({ descricao: e.descricao, percentual: e.percentual })),
  );

  // valor por etapa vem do backend (alinhado por índice após salvar).
  const valorSalvo = (i: number): number | null =>
    data.cronograma[i]?.valor ?? null;

  const totalPct = etapas.reduce(
    (s, e) => s + (e.percentual === '' || e.percentual == null ? 0 : Number(e.percentual)),
    0,
  );
  const totalArred = Math.round(totalPct * 100) / 100;
  const fecha100 = etapas.length === 0 || totalArred === 100;

  function atualizar(i: number, campo: keyof EtapaEdit, valor: string | number): void {
    setEtapas((arr) => arr.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)));
  }
  function adicionar(): void {
    setEtapas((arr) => [...arr, { descricao: '', percentual: '' }]);
  }
  function remover(i: number): void {
    setEtapas((arr) => arr.filter((_, j) => j !== i));
  }
  function salvar(): void {
    onSalvar(
      etapas
        .filter((e) => e.descricao.trim() !== '')
        .map((e) => ({
          descricao: e.descricao.trim(),
          percentual: e.percentual === '' || e.percentual == null ? 0 : Number(e.percentual),
        })),
    );
  }

  return (
    <Card withBorder radius="lg" p="lg">
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="xs">
        <Box>
          <Text fw={600} fz={15}>
            Cronograma físico-financeiro
          </Text>
          <Text fz={12.5} c="dimmed">
            Distribua a obra por etapa (%). O valor de cada etapa sai do valor global.
          </Text>
        </Box>
        <Button variant="default" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={adicionar} disabled={!editavel}>
          Adicionar etapa
        </Button>
      </Group>

      {etapas.length === 0 ? (
        <Text fz={13} c="dimmed" py="sm">
          Nenhuma etapa ainda. Adicione etapas (ex.: por mês ou por marco da obra) para montar o cronograma.
        </Text>
      ) : (
        <Stack gap={4}>
          {etapas.map((e, i) => {
            const pct = e.percentual === '' || e.percentual == null ? 0 : Number(e.percentual);
            return (
              <Group
                key={i}
                gap="md"
                wrap="nowrap"
                align="center"
                className={classes.itemRow}
                py={8}
                style={{ borderTop: i > 0 ? '1px solid var(--mantine-color-concreto-2)' : undefined }}
              >
                {/* Descrição: "Etapa N —" fixo + campo sem moldura, lê como texto
                    mas continua editável (design de leitura do handoff). */}
                <Group gap={6} wrap="nowrap" align="baseline" style={{ flex: 1, minWidth: 0 }}>
                  <Text fz={13.5} fw={600} c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    Etapa {i + 1} —
                  </Text>
                  <TextInput
                    flex={1}
                    variant="unstyled"
                    placeholder="descrição da etapa"
                    value={e.descricao}
                    onChange={(ev) => atualizar(i, 'descricao', ev.currentTarget.value)}
                    disabled={!editavel}
                    styles={{ input: { fontSize: 13.5, fontWeight: 600 } }}
                  />
                </Group>
                <Progress
                  value={Math.min(pct, 100)}
                  color="orange.7"
                  radius="xl"
                  size="md"
                  w={200}
                  style={{ flex: 'none' }}
                  visibleFrom="sm"
                />
                <NumberInput
                  w={72}
                  variant="unstyled"
                  placeholder="0%"
                  value={e.percentual}
                  onChange={(v) => atualizar(i, 'percentual', v)}
                  min={0}
                  max={100}
                  decimalScale={2}
                  decimalSeparator=","
                  suffix="%"
                  hideControls
                  disabled={!editavel}
                  style={{ flex: 'none' }}
                  styles={{
                    input: {
                      textAlign: 'right',
                      fontFamily: 'var(--mantine-font-family-monospace)',
                      fontWeight: 600,
                      fontSize: 13.5,
                    },
                  }}
                />
                <Text
                  w={110}
                  ta="right"
                  ff="monospace"
                  fz={13}
                  fw={600}
                  c={valorSalvo(i) == null ? 'dimmed' : undefined}
                  style={{ flex: 'none' }}
                >
                  {valorSalvo(i) == null ? '—' : brl(valorSalvo(i))}
                </Text>
                <ActionIcon
                  className={classes.itemAction}
                  variant="subtle"
                  color="gray"
                  onClick={() => remover(i)}
                  aria-label="Remover etapa"
                  disabled={!editavel}
                  style={{ flex: 'none' }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            );
          })}
        </Stack>
      )}

      <Group justify="space-between" mt="lg" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
        <Group gap="xs">
          <Text fz={13} c={fecha100 ? 'dimmed' : 'alerta.7'} fw={fecha100 ? 400 : 600}>
            Total: {totalArred.toLocaleString('pt-BR')}%
          </Text>
          {!fecha100 && (
            <Text fz={12.5} c="alerta.7">
              {totalArred < 100
                ? `faltam ${(100 - totalArred).toLocaleString('pt-BR')}% para fechar 100%`
                : `${(totalArred - 100).toLocaleString('pt-BR')}% acima de 100%`}
            </Text>
          )}
          {fecha100 && etapas.length > 0 && (
            <Group gap={4} c="apto.7">
              <IconCircleCheck size={15} />
              <Text fz={12.5}>fecha 100%</Text>
            </Group>
          )}
        </Group>
        <Button color="orange" size="sm" onClick={salvar} disabled={!editavel}>
          Salvar cronograma
        </Button>
      </Group>
    </Card>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Group justify="space-between" mt={6}>
      <Text fz={13} c="concreto.4">
        {rotulo}
      </Text>
      <Text fz={13} fw={600} ff="monospace">
        {valor}
      </Text>
    </Group>
  );
}

// Duas colunas que empilham no mobile (sem depender de Grid).
function Flex2({ children }: { children: ReactNode }) {
  return (
    <Box
      style={{
        display: 'flex',
        gap: 'var(--mantine-spacing-lg)',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      {children}
    </Box>
  );
}
