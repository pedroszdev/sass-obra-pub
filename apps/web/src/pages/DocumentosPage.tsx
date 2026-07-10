import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  FileButton,
  Group,
  Menu,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCertificate,
  IconChevronDown,
  IconClipboardList,
  IconDotsVertical,
  IconDownload,
  IconEye,
  IconFileText,
  IconPaperclip,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { AtestadoFormModal } from '../components/AtestadoFormModal';
import { CertidaoFormModal } from '../components/CertidaoFormModal';
import { ProntidaoPanel } from '../components/ProntidaoPanel';
import { ErrorState, LoadingCards } from '../components/StateViews';
import { useCompanyProfile } from '../hooks/useCompanyProfile';
import { useProntidao } from '../hooks/useProntidao';
import {
  ApiError,
  downloadAtestadoArquivo,
  downloadCertidaoArquivo,
  removeAtestado,
  removeAtestadoArquivo,
  removeCertidao,
  removeCertidaoArquivo,
  uploadAtestadoArquivo,
  uploadCertidaoArquivo,
  viewAtestadoArquivo,
  viewCertidaoArquivo,
} from '../lib/api';
import {
  CERTIDAO_TIPO_LABELS,
  formatBytes,
  STATUS_META,
  validadeLabel,
  validadeStatus,
  VENCENDO_DIAS,
} from '../lib/certidao';
import type { ValidadeStatus } from '../lib/certidao';
import { brl } from '../lib/format';
import type { Atestado, Certidao } from '../types/company-profile';
import classes from '../styles/cards.module.css';

// Cabeçalho de tabela no estilo mono do handoff.
const TABLE_TH = {
  fontFamily: 'var(--mantine-font-family-monospace)',
  textTransform: 'uppercase' as const,
  fontSize: '0.7rem',
  letterSpacing: '0.06em',
  fontWeight: 500,
  color: 'var(--mantine-color-graphite-5)',
};

const ACCEPT = 'application/pdf,image/jpeg,image/png';

// Ordem de urgência das certidões: vencida primeiro, depois vencendo, válida e
// por fim sem-validade. Dentro do mesmo status, a de validade mais próxima sobe.
const STATUS_ORDEM: Record<ValidadeStatus, number> = {
  vencido: 0,
  vencendo: 1,
  valido: 2,
  'sem-validade': 3,
};

function ordenarPorUrgencia(certidoes: Certidao[]): Certidao[] {
  return [...certidoes].sort((a, b) => {
    const sa = STATUS_ORDEM[validadeStatus(a.dataValidade)];
    const sb = STATUS_ORDEM[validadeStatus(b.dataValidade)];
    if (sa !== sb) return sa - sb;
    // Mesma faixa: a validade mais próxima primeiro (sem data vai pro fim).
    return (a.dataValidade ?? '9999').localeCompare(b.dataValidade ?? '9999');
  });
}

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export function DocumentosPage() {
  const { state, reload } = useCompanyProfile();
  const { state: prontidaoState, reload: reloadProntidao } = useProntidao();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const certidoesRef = useRef<HTMLDivElement>(null);

  // Editar o cofre muda a prontidão — recarrega os dois.
  function reloadAll() {
    reload();
    reloadProntidao();
  }

  // Modais (item = edição; null = criação).
  const [certidaoModal, setCertidaoModal] = useState<{
    open: boolean;
    item: Certidao | null;
  }>({ open: false, item: null });
  const [atestadoModal, setAtestadoModal] = useState<{
    open: boolean;
    item: Atestado | null;
  }>({ open: false, item: null });

  // Ação que muda dados: sinaliza busy, mostra erro e recarrega ao fim.
  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      reloadAll();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Não foi possível concluir a ação. Tente de novo.',
      );
    } finally {
      setBusy(false);
    }
  }

  // Ação só de leitura (abrir/baixar arquivo): não recarrega o cofre — evita o
  // flicker de refetch quando só abrimos o PDF numa aba.
  async function runQuiet(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Não foi possível abrir o arquivo. Tente de novo.',
      );
    }
  }

  function askConfirm(
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
  ) {
    setConfirm({ title, message, confirmLabel, onConfirm });
  }

  if (state.status === 'loading') {
    return (
      <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
        <Box maw={980} mx="auto">
          <LoadingCards count={4} />
        </Box>
      </Box>
    );
  }

  if (state.status === 'error') {
    return (
      <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
        <Box maw={980} mx="auto">
          <ErrorState
            title="Não foi possível carregar"
            description={state.message}
            onRetry={reload}
          />
        </Box>
      </Box>
    );
  }

  const { atestados } = state.data;
  const certidoes = ordenarPorUrgencia(state.data.certidoes);

  // Stat cards são só de CERTIDÕES (atestados não expiram) — assim os três
  // contam o mesmo universo e o denominador fecha.
  const validas = certidoes.filter((c) => {
    const s = validadeStatus(c.dataValidade);
    return s === 'valido' || s === 'sem-validade';
  }).length;
  const vencendo = certidoes.filter(
    (c) => validadeStatus(c.dataValidade) === 'vencendo',
  ).length;
  const vencida = certidoes.filter(
    (c) => validadeStatus(c.dataValidade) === 'vencido',
  ).length;

  function scrollToCertidoes() {
    certidoesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={980} mx="auto">
        <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap">
          <Box>
            <Title order={1} fz={26} style={{ letterSpacing: '-0.01em' }}>
              Documentos da empresa
            </Title>
            <Text c="dimmed" fz="sm" mt={2}>
              Mantenha tudo em dia pra nunca ser desclassificado.
            </Text>
          </Box>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                color="orange"
                leftSection={<IconPlus size={16} />}
                rightSection={<IconChevronDown size={14} />}
              >
                Adicionar documento
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconCertificate size={16} />}
                onClick={() => setCertidaoModal({ open: true, item: null })}
              >
                Certidão
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileText size={16} />}
                onClick={() => setAtestadoModal({ open: true, item: null })}
              >
                Atestado de capacidade técnica
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        {/* stat cards do cofre — só certidões, e clicáveis (rolam pra tabela) */}
        <SimpleGrid cols={{ base: 3 }} spacing="md" mb="lg">
          <DocStat label="Certidões válidas" value={validas} color="apto" onClick={scrollToCertidoes} />
          <DocStat
            label={`Vencendo (${VENCENDO_DIAS} dias)`}
            value={vencendo}
            color="orange"
            onClick={scrollToCertidoes}
          />
          <DocStat label="Vencidas" value={vencida} color="alerta" onClick={scrollToCertidoes} />
        </SimpleGrid>

        {actionError && (
          <Alert
            color="red"
            variant="light"
            icon={<IconAlertTriangle size={18} />}
            mb="md"
            withCloseButton
            onClose={() => setActionError(null)}
          >
            {actionError}
          </Alert>
        )}

        {/* prontidão genérica (T-46) — o "o que falta pra estar habilitado", com
            os links de emissão. É a única leitura de urgência aqui: os stat cards
            dão o número e este painel diz o que fazer (o alerta duplicado saiu). */}
        <ProntidaoPanel state={prontidaoState} />

        {/* certidões */}
        <Text ref={certidoesRef} fz={16} fw={700} ff="heading" mb="sm" style={{ scrollMarginTop: 72 }}>
          Certidões
        </Text>

        {certidoes.length === 0 ? (
          <Card withBorder radius="md" py={40} px="lg" mb="xl">
            <Stack align="center" gap="xs">
              <ThemeIcon variant="light" color="gray" radius="xl" size={48}>
                <IconCertificate size={24} />
              </ThemeIcon>
              <Text fw={600}>Nenhuma certidão ainda</Text>
              <Text c="dimmed" fz="sm" ta="center" maw={420}>
                Cadastre suas certidões (CND, FGTS, CNDT…) e anexe o PDF de cada
                uma para tê-las à mão na hora da proposta.
              </Text>
            </Stack>
          </Card>
        ) : (
          <Card withBorder radius="lg" p={0} mb="xl" style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={560}>
              <Table verticalSpacing="md" horizontalSpacing="lg" styles={{ th: TABLE_TH }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Documento</Table.Th>
                    <Table.Th>Validade</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th aria-label="Ações" />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {certidoes.map((c) => (
                    <CertidaoRow
                      key={c.id}
                      certidao={c}
                      busy={busy}
                      onEdit={() => setCertidaoModal({ open: true, item: c })}
                      onDelete={() =>
                        askConfirm(
                          'Excluir certidão',
                          'A certidão e o arquivo anexado serão removidos. Não dá pra desfazer.',
                          'Excluir',
                          () => void runAction(() => removeCertidao(c.id)),
                        )
                      }
                      onUpload={(file) =>
                        void runAction(() => uploadCertidaoArquivo(c.id, file))
                      }
                      onRemoveArquivo={() =>
                        askConfirm(
                          'Remover arquivo',
                          'O PDF anexado será removido (a certidão continua cadastrada).',
                          'Remover',
                          () => void runAction(() => removeCertidaoArquivo(c.id)),
                        )
                      }
                      onView={() => void runQuiet(() => viewCertidaoArquivo(c.id))}
                      onDownload={() =>
                        void runQuiet(() =>
                          downloadCertidaoArquivo(c.id, c.arquivo!.nomeArquivo),
                        )
                      }
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        )}

        {/* atestados */}
        <Text fz={16} fw={700} ff="heading" mb="sm">
          Atestados de capacidade técnica
        </Text>

        {atestados.length === 0 ? (
          <Card withBorder radius="md" py={40} px="lg" mb="xl">
            <Stack align="center" gap="xs">
              <ThemeIcon variant="light" color="gray" radius="xl" size={48}>
                <IconFileText size={24} />
              </ThemeIcon>
              <Text fw={600}>Nenhum atestado ainda</Text>
              <Text c="dimmed" fz="sm" ta="center" maw={420}>
                Registre as obras que sua empresa já executou — é o que comprova
                a capacidade técnica exigida nos editais.
              </Text>
            </Stack>
          </Card>
        ) : (
          <Card withBorder radius="lg" p={0} mb="xl" style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing="md" horizontalSpacing="lg" styles={{ th: TABLE_TH }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Obra</Table.Th>
                    <Table.Th ta="right">Quantitativo</Table.Th>
                    <Table.Th ta="right">Valor</Table.Th>
                    <Table.Th>Contratante</Table.Th>
                    <Table.Th ta="right">Ano</Table.Th>
                    <Table.Th aria-label="Ações" />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {atestados.map((a) => (
                    <AtestadoRow
                      key={a.id}
                      atestado={a}
                      busy={busy}
                      onEdit={() => setAtestadoModal({ open: true, item: a })}
                      onUpload={(file) =>
                        void runAction(() => uploadAtestadoArquivo(a.id, file))
                      }
                      onRemoveArquivo={() =>
                        askConfirm(
                          'Remover CAT',
                          'O PDF da CAT será removido (o atestado continua cadastrado).',
                          'Remover',
                          () => void runAction(() => removeAtestadoArquivo(a.id)),
                        )
                      }
                      onView={() => void runQuiet(() => viewAtestadoArquivo(a.id))}
                      onDownload={() =>
                        void runQuiet(() =>
                          downloadAtestadoArquivo(a.id, a.arquivo!.nomeArquivo),
                        )
                      }
                      onDelete={() =>
                        askConfirm(
                          'Excluir atestado',
                          'O atestado e a CAT anexada serão removidos. Não dá pra desfazer.',
                          'Excluir',
                          () => void runAction(() => removeAtestado(a.id)),
                        )
                      }
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        )}

        {/* placeholder de camada 2 (T-45/T-46) — ainda não construído */}
        <Card
          radius="md"
          p="lg"
          style={{ border: '1px dashed var(--mantine-color-gray-4)' }}
        >
          <Group gap="md" wrap="nowrap">
            <ThemeIcon variant="light" color="gray" radius="md" size={40}>
              <IconClipboardList size={20} />
            </ThemeIcon>
            <Box style={{ flex: 1 }}>
              <Group gap="xs">
                <Text fw={600}>Checklist de habilitação por edital</Text>
                <Badge color="gray" variant="light" radius="sm" tt="none">
                  Em breve
                </Badge>
              </Group>
              <Text c="dimmed" fz="sm" mt={2}>
                Em breve esta seção vai cruzar as exigências de cada edital com os
                documentos do seu cofre e mostrar o que falta.
              </Text>
            </Box>
          </Group>
        </Card>
      </Box>

      <CertidaoFormModal
        opened={certidaoModal.open}
        certidao={certidaoModal.item}
        onClose={() => setCertidaoModal({ open: false, item: null })}
        onSaved={reloadAll}
      />
      <AtestadoFormModal
        opened={atestadoModal.open}
        atestado={atestadoModal.item}
        onClose={() => setAtestadoModal({ open: false, item: null })}
        onSaved={reloadAll}
      />

      <Modal
        opened={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        centered
        radius="md"
        size="sm"
      >
        <Text fz={14} c="dimmed">
          {confirm?.message}
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button
            color="red"
            onClick={() => {
              confirm?.onConfirm();
              setConfirm(null);
            }}
          >
            {confirm?.confirmLabel ?? 'Confirmar'}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}

function DocStat({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  onClick: () => void;
}) {
  return (
    <UnstyledButton onClick={onClick} style={{ display: 'block' }}>
      <Card
        withBorder
        radius="md"
        p="md"
        className={classes.hoverCard}
        style={{ borderColor: `var(--mantine-color-${color}-3)` }}
      >
        <Text fz={12} c="dimmed" mb={6}>
          {label}
        </Text>
        <Text fz={28} fw={800} c={`${color}.8`} lh={1}>
          {value}
        </Text>
      </Card>
    </UnstyledButton>
  );
}

// Bloco de arquivo reusado nas duas tabelas: quando há PDF, o nome vira link que
// abre em nova aba; quando não há, um botão âmbar discreto pra anexar na hora
// (a ação principal do cofre, antes escondida no menu "⋮").
function ArquivoCell({
  arquivo,
  semArquivoLabel,
  anexarLabel,
  busy,
  onUpload,
  onView,
}: {
  arquivo: { nomeArquivo: string; tamanhoBytes: number } | null;
  semArquivoLabel: string;
  anexarLabel: string;
  busy: boolean;
  onUpload: (file: File) => void;
  onView: () => void;
}) {
  if (arquivo) {
    return (
      <Group gap={5} mt={4} wrap="nowrap">
        <IconPaperclip size={12} color="var(--mantine-color-aco-6)" style={{ flex: 'none' }} />
        <Anchor component="button" type="button" onClick={onView} fz={11.5} lineClamp={1} title={arquivo.nomeArquivo}>
          {arquivo.nomeArquivo} ({formatBytes(arquivo.tamanhoBytes)})
        </Anchor>
      </Group>
    );
  }
  return (
    <Group gap="xs" mt={5} wrap="nowrap">
      <Text fz={11.5} c="dimmed">
        {semArquivoLabel}
      </Text>
      <FileButton onChange={(f) => f && onUpload(f)} accept={ACCEPT}>
        {(props) => (
          <Button
            {...props}
            size="compact-xs"
            variant="light"
            color="orange"
            leftSection={<IconPaperclip size={12} />}
            disabled={busy}
          >
            {anexarLabel}
          </Button>
        )}
      </FileButton>
    </Group>
  );
}

interface CertidaoRowProps {
  certidao: Certidao;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpload: (file: File) => void;
  onRemoveArquivo: () => void;
  onView: () => void;
  onDownload: () => void;
}

function CertidaoRow({
  certidao: c,
  busy,
  onEdit,
  onDelete,
  onUpload,
  onRemoveArquivo,
  onView,
  onDownload,
}: CertidaoRowProps) {
  const status = validadeStatus(c.dataValidade);
  const meta = STATUS_META[status];
  const nome =
    c.tipo === 'OUTRA' && c.descricao
      ? c.descricao
      : CERTIDAO_TIPO_LABELS[c.tipo];

  return (
    <Table.Tr>
      <Table.Td>
        <Text fz={13.5} fw={600} lineClamp={1}>
          {nome}
        </Text>
        <ArquivoCell
          arquivo={c.arquivo}
          semArquivoLabel="Sem PDF"
          anexarLabel="Anexar PDF"
          busy={busy}
          onUpload={onUpload}
          onView={onView}
        />
      </Table.Td>
      <Table.Td>
        <Text fz={13} ff="monospace" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {validadeLabel(c.dataValidade)}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge color={meta.color} variant="light" radius="sm" tt="none">
          {meta.label}
        </Badge>
      </Table.Td>
      <Table.Td style={{ textAlign: 'right' }}>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" disabled={busy} aria-label="Ações da certidão">
              <IconDotsVertical size={17} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {c.arquivo && (
              <Menu.Item leftSection={<IconEye size={14} />} onClick={onView}>
                Ver PDF
              </Menu.Item>
            )}
            <FileButton onChange={(f) => f && onUpload(f)} accept={ACCEPT}>
              {(props) => (
                <Menu.Item leftSection={<IconPaperclip size={14} />} onClick={props.onClick}>
                  {c.arquivo ? 'Substituir arquivo' : 'Anexar arquivo'}
                </Menu.Item>
              )}
            </FileButton>
            {c.arquivo && (
              <Menu.Item leftSection={<IconDownload size={14} />} onClick={onDownload}>
                Baixar arquivo
              </Menu.Item>
            )}
            {c.arquivo && (
              <Menu.Item color="red" leftSection={<IconX size={14} />} onClick={onRemoveArquivo}>
                Remover arquivo
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={onEdit}>
              Editar
            </Menu.Item>
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onDelete}>
              Excluir
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  );
}

function AtestadoRow({
  atestado: a,
  busy,
  onEdit,
  onDelete,
  onUpload,
  onRemoveArquivo,
  onView,
  onDownload,
}: {
  atestado: Atestado;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpload: (file: File) => void;
  onRemoveArquivo: () => void;
  onView: () => void;
  onDownload: () => void;
}) {
  return (
    <Table.Tr>
      <Table.Td>
        <Text fz={13.5} fw={600} lineClamp={2} maw={260}>
          {a.descricao}
        </Text>
        <ArquivoCell
          arquivo={a.arquivo}
          semArquivoLabel="Sem CAT"
          anexarLabel="Anexar CAT"
          busy={busy}
          onUpload={onUpload}
          onView={onView}
        />
      </Table.Td>
      <Table.Td>
        <Text fz={13} ff="monospace" ta="right" c={a.quantitativo == null ? 'dimmed' : undefined} style={{ whiteSpace: 'nowrap' }}>
          {a.quantitativo == null
            ? '—'
            : `${a.quantitativo.toLocaleString('pt-BR')}${a.unidade ? ` ${a.unidade}` : ''}`}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text fz={13} ff="monospace" ta="right" c={a.valor == null ? 'dimmed' : undefined} style={{ whiteSpace: 'nowrap' }}>
          {a.valor == null ? '—' : brl(a.valor)}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text fz={13} lineClamp={1} c={a.contratante ? undefined : 'dimmed'}>
          {a.contratante ?? '—'}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text fz={13} ff="monospace" ta="right" c={a.ano == null ? 'dimmed' : undefined}>
          {a.ano ?? '—'}
        </Text>
      </Table.Td>
      <Table.Td style={{ textAlign: 'right' }}>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" disabled={busy} aria-label="Ações do atestado">
              <IconDotsVertical size={17} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {a.arquivo && (
              <Menu.Item leftSection={<IconEye size={14} />} onClick={onView}>
                Ver CAT
              </Menu.Item>
            )}
            <FileButton onChange={(f) => f && onUpload(f)} accept={ACCEPT}>
              {(props) => (
                <Menu.Item leftSection={<IconPaperclip size={14} />} onClick={props.onClick}>
                  {a.arquivo ? 'Substituir CAT' : 'Anexar CAT (PDF)'}
                </Menu.Item>
              )}
            </FileButton>
            {a.arquivo && (
              <Menu.Item leftSection={<IconDownload size={14} />} onClick={onDownload}>
                Baixar CAT
              </Menu.Item>
            )}
            {a.arquivo && (
              <Menu.Item color="red" leftSection={<IconX size={14} />} onClick={onRemoveArquivo}>
                Remover CAT
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={onEdit}>
              Editar
            </Menu.Item>
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onDelete}>
              Excluir
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  );
}
