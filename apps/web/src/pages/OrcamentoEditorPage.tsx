import {
  ActionIcon,
  Alert,
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
  IconDownload,
  IconFileSpreadsheet,
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
  getProposta,
  importarItensDoEdital,
  updateProposta,
  updatePropostaItem,
} from '../lib/api';
import { brl, brlCompact, fmtDate } from '../lib/format';
import type {
  CreatePropostaItemInput,
  PropostaDetail,
  PropostaStatus,
} from '../types/proposta';

const STATUS: Record<PropostaStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'orange' },
  finalizada: { label: 'Finalizada', color: 'apto' },
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
function parseNum(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Modal de inclusão manual (T-65): um item por formulário ou colar vários.
function AddItensModal({
  opened,
  onClose,
  onAddOne,
  onAddMany,
}: {
  opened: boolean;
  onClose: () => void;
  onAddOne: (input: CreatePropostaItemInput) => Promise<void>;
  onAddMany: (itens: CreatePropostaItemInput[]) => Promise<void>;
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
  function parseColar(): CreatePropostaItemInput[] {
    return colar
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [descricao, unidade, qtd, prc] = l.split(/\t|;|\s{2,}/);
        return {
          descricao: (descricao ?? '').trim(),
          unidade: unidade?.trim() || null,
          quantidade: qtd ? parseNum(qtd) : null,
          precoUnitario: prc ? parseNum(prc) : null,
        };
      })
      .filter((i) => i.descricao);
  }

  async function submitMany() {
    const itens = parseColar();
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
      <Tabs defaultValue="um">
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
  const [addOpen, setAddOpen] = useState(false);

  // Carrega/recarrega o detalhe (com os totais do backend, §3.3).
  async function carregar(signal?: AbortSignal): Promise<void> {
    if (!id) return;
    try {
      const data = await getProposta(id, signal);
      if (signal?.aborted) return;
      setState({ status: 'success', data });
      setBdi(data.bdiPercentual ?? '');
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

  async function salvarPreco(itemId: string): Promise<void> {
    if (!id) return;
    const valor = precos[itemId];
    const preco = valor === '' || valor == null ? null : Number(valor);
    setSalvando(true);
    try {
      await updatePropostaItem(id, itemId, { precoUnitario: preco });
      await recarregarTotais();
    } finally {
      setSalvando(false);
    }
  }

  async function salvarBdi(): Promise<void> {
    if (!id) return;
    const valor = bdi === '' || bdi == null ? 0 : Number(bdi);
    setSalvando(true);
    try {
      await updateProposta(id, { bdiPercentual: valor });
      await recarregarTotais();
    } finally {
      setSalvando(false);
    }
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
    } catch {
      setAviso('Não foi possível importar do edital agora. Tente de novo ou adicione manual.');
    } finally {
      setImportando(false);
    }
  }

  async function removerItem(itemId: string): Promise<void> {
    if (!id) return;
    await deletePropostaItem(id, itemId);
    setPrecos((p) => {
      const resto = { ...p };
      delete resto[itemId];
      return resto;
    });
    await recarregarTotais();
  }

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

  async function alternarStatus(atual: PropostaStatus): Promise<void> {
    if (!id) return;
    setSalvando(true);
    try {
      await updateProposta(id, {
        status: atual === 'rascunho' ? 'finalizada' : 'rascunho',
      });
      await recarregarTotais();
    } finally {
      setSalvando(false);
    }
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
            precos={precos}
            setPrecos={setPrecos}
            bdi={bdi}
            setBdi={setBdi}
            onSalvarPreco={salvarPreco}
            onSalvarBdi={salvarBdi}
            onImportar={importar}
            importando={importando}
            onRemover={removerItem}
            onAbrirAdd={() => setAddOpen(true)}
            onAlternarStatus={alternarStatus}
            aviso={aviso}
          />
        )}
      </Box>

      <AddItensModal
        opened={addOpen}
        onClose={() => setAddOpen(false)}
        onAddOne={adicionarUm}
        onAddMany={adicionarVarios}
      />
    </Box>
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
  onAlternarStatus,
  aviso,
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
  onAbrirAdd: () => void;
  onAlternarStatus: (atual: PropostaStatus) => void;
  aviso: string | null;
}) {
  const c = data.calculo;
  const comp = c.comparacao;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Box>
          <Badge color={STATUS[data.status].color} variant="light" radius="sm" tt="none" mb="xs">
            {STATUS[data.status].label}
          </Badge>
          <Title order={1} fz={24} style={{ letterSpacing: '-0.01em' }}>
            {data.titulo}
          </Title>
          <Text fz={13} c="dimmed" mt={2}>
            Valor de referência: {brl(data.valorReferencia)} · atualizado em{' '}
            {fmtDate(data.updatedAt)}
          </Text>
        </Box>
        <Group gap="xs">
          <Button
            component={Link}
            to={`/editais/${data.editalId}`}
            variant="default"
            size="sm"
          >
            Ver edital
          </Button>
          <Button
            color={data.status === 'rascunho' ? 'orange' : 'gray'}
            variant={data.status === 'rascunho' ? 'filled' : 'default'}
            size="sm"
            onClick={() => onAlternarStatus(data.status)}
          >
            {data.status === 'rascunho' ? 'Finalizar' : 'Reabrir'}
          </Button>
        </Group>
      </Group>

      {aviso && (
        <Alert color="orange" variant="light" radius="md">
          {aviso}
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
                  >
                    Importar do edital
                  </Button>
                  <Button variant="default" leftSection={<IconPlus size={16} />} onClick={onAbrirAdd}>
                    Adicionar item
                  </Button>
                </Group>
              </Stack>
            </Box>
          ) : (
            <>
              <Table.ScrollContainer minWidth={680}>
                <Table verticalSpacing="sm" horizontalSpacing="md" styles={TH}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={36}>#</Table.Th>
                      <Table.Th>Descrição do serviço</Table.Th>
                      <Table.Th w={70}>Unid.</Table.Th>
                      <Table.Th w={90}>Qtd.</Table.Th>
                      <Table.Th w={150}>Preço unit.</Table.Th>
                      <Table.Th w={120}>Subtotal</Table.Th>
                      <Table.Th w={44} aria-label="Ações" />
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
                        <Table.Tr key={item.id}>
                          <Table.Td>
                            <Text fz={12} c="dimmed" ff="monospace">
                              {i + 1}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text fz={13.5}>{item.descricao}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text fz={13} c="dimmed">
                              {item.unidade ?? '—'}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text fz={13} ff="monospace">
                              {item.quantidade ?? '—'}
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
                              placeholder="0,00"
                              prefix="R$ "
                              styles={{ input: { textAlign: 'right' } }}
                            />
                          </Table.Td>
                          <Table.Td>
                            <Text fz={13} fw={600} c={semPreco ? 'dimmed' : undefined} ta="right">
                              {semPreco ? '—' : brl(sub)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              aria-label="Remover item"
                              onClick={() => onRemover(item.id)}
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
              <Group p="md" gap="sm">
                <Button
                  variant="light"
                  color="orange"
                  size="xs"
                  leftSection={<IconSparkles size={15} />}
                  onClick={onImportar}
                  loading={importando}
                >
                  Importar do edital
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconPlus size={15} />}
                  onClick={onAbrirAdd}
                >
                  Adicionar item
                </Button>
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
              mb="md"
              styles={{ label: { color: 'var(--mantine-color-concreto-4)', fontSize: 12 } }}
            />

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

            {c.itensSemPreco > 0 && (
              <Text fz={12} c="concreto.5" mt="md">
                {c.itensSemPreco} {c.itensSemPreco === 1 ? 'item sem preço' : 'itens sem preço'} ainda.
              </Text>
            )}

            <Menu position="bottom" withinPortal>
              <Menu.Target>
                <Button
                  fullWidth
                  color="orange"
                  mt="lg"
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
          </Card>

          <Card withBorder radius="lg" p="lg" mt="lg">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" color="gray" radius="md" size={36}>
                <IconCircleCheck size={18} />
              </ThemeIcon>
              <Box>
                <Text fz={13.5} fw={600}>
                  Cronograma físico-financeiro
                </Text>
                <Text fz={12} c="dimmed">
                  Em breve — distribuir a obra por mês.
                </Text>
              </Box>
            </Group>
          </Card>
        </Box>
      </Flex2>
    </Stack>
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
