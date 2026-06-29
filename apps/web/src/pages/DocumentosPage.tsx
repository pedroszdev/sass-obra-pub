import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  FileButton,
  Group,
  Menu,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCertificate,
  IconChevronDown,
  IconClipboardList,
  IconDotsVertical,
  IconDownload,
  IconFileText,
  IconPaperclip,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';

// Cabeçalho de tabela no estilo mono do handoff.
const TABLE_TH = {
  fontFamily: 'var(--mantine-font-family-monospace)',
  textTransform: 'uppercase' as const,
  fontSize: '0.7rem',
  letterSpacing: '0.06em',
  fontWeight: 500,
  color: 'var(--mantine-color-graphite-5)',
};
import { useState } from 'react';
import { AtestadoFormModal } from '../components/AtestadoFormModal';
import { CertidaoAlert } from '../components/CertidaoAlert';
import { CertidaoFormModal } from '../components/CertidaoFormModal';
import { ProntidaoPanel } from '../components/ProntidaoPanel';
import { ErrorState, LoadingCards } from '../components/StateViews';
import { useCompanyProfile } from '../hooks/useCompanyProfile';
import { useProntidao } from '../hooks/useProntidao';
import {
  ApiError,
  downloadCertidaoArquivo,
  removeAtestado,
  removeCertidao,
  removeCertidaoArquivo,
  uploadCertidaoArquivo,
} from '../lib/api';
import {
  CERTIDAO_TIPO_LABELS,
  formatBytes,
  STATUS_META,
  validadeLabel,
  validadeStatus,
} from '../lib/certidao';
import { brl } from '../lib/format';
import type { Atestado, Certidao } from '../types/company-profile';

const ACCEPT = 'application/pdf,image/jpeg,image/png';

export function DocumentosPage() {
  const { state, reload } = useCompanyProfile();
  const { state: prontidaoState, reload: reloadProntidao } = useProntidao();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const { certidoes, atestados } = state.data;

  // Contagens reais para os stat cards (atestados não expiram → "em dia").
  const emDia =
    certidoes.filter((c) => {
      const s = validadeStatus(c.dataValidade);
      return s === 'valido' || s === 'sem-validade';
    }).length + atestados.length;
  const vencendo = certidoes.filter(
    (c) => validadeStatus(c.dataValidade) === 'vencendo',
  ).length;
  const vencida = certidoes.filter(
    (c) => validadeStatus(c.dataValidade) === 'vencido',
  ).length;

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

        {/* stat cards do cofre */}
        <SimpleGrid cols={3} spacing="md" mb="lg">
          <DocStat label="Em dia" value={emDia} color="apto" />
          <DocStat label="Vencendo em breve" value={vencendo} color="orange" />
          <DocStat label="Vencida" value={vencida} color="alerta" />
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

        {/* alerta de vencimento (T-43) — sem link, já estamos no cofre */}
        <CertidaoAlert certidoes={certidoes} linkToCofre={false} mb="lg" />

        {/* prontidão genérica (T-46) — semáforo do que falta */}
        <ProntidaoPanel state={prontidaoState} />

        {/* certidões */}
        <Text fz={16} fw={700} ff="heading" mb="sm">
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
            <Table.ScrollContainer minWidth={520}>
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
                onDelete={() => {
                  if (window.confirm('Excluir esta certidão? O arquivo anexado também será removido.')) {
                    void runAction(() => removeCertidao(c.id));
                  }
                }}
                onUpload={(file) =>
                  void runAction(() => uploadCertidaoArquivo(c.id, file))
                }
                onRemoveArquivo={() => {
                  if (window.confirm('Remover o arquivo anexado?')) {
                    void runAction(() => removeCertidaoArquivo(c.id));
                  }
                }}
                onDownload={() =>
                  void runAction(() =>
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
            <Table.ScrollContainer minWidth={520}>
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
                  {atestados.map((a) => (
                    <AtestadoRow
                key={a.id}
                atestado={a}
                busy={busy}
                onEdit={() => setAtestadoModal({ open: true, item: a })}
                onDelete={() => {
                  if (window.confirm('Excluir este atestado?')) {
                    void runAction(() => removeAtestado(a.id));
                  }
                }}
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
    </Box>
  );
}

function DocStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card
      withBorder
      radius="md"
      p="md"
      style={{ borderColor: `var(--mantine-color-${color}-3)` }}
    >
      <Text fz={12} c="dimmed" mb={6}>
        {label}
      </Text>
      <Text fz={28} fw={800} c={`${color}.8`} lh={1}>
        {value}
      </Text>
    </Card>
  );
}

interface CertidaoRowProps {
  certidao: Certidao;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpload: (file: File) => void;
  onRemoveArquivo: () => void;
  onDownload: () => void;
}

function CertidaoRow({
  certidao: c,
  busy,
  onEdit,
  onDelete,
  onUpload,
  onRemoveArquivo,
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
        {c.arquivo ? (
          <Group gap={5} mt={3} wrap="nowrap">
            <IconPaperclip size={12} color="var(--mantine-color-aco-6)" style={{ flex: 'none' }} />
            <Text fz={11.5} c="dimmed" lineClamp={1}>
              {c.arquivo.nomeArquivo} ({formatBytes(c.arquivo.tamanhoBytes)})
            </Text>
          </Group>
        ) : (
          <Text fz={11.5} c="dimmed" mt={3}>
            Sem arquivo anexado
          </Text>
        )}
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
}: {
  atestado: Atestado;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const detalhes = [
    a.quantitativo != null
      ? `${a.quantitativo}${a.unidade ? ` ${a.unidade}` : ''}`
      : null,
    a.valor != null ? brl(a.valor) : null,
    a.contratante,
    a.ano != null ? String(a.ano) : null,
  ].filter(Boolean);

  return (
    <Table.Tr>
      <Table.Td>
        <Text fz={13.5} fw={600} lineClamp={1}>
          {a.descricao}
        </Text>
        {detalhes.length > 0 && (
          <Text fz={11.5} c="dimmed" mt={3} lineClamp={1}>
            {detalhes.join(' · ')}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Text fz={13} c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          não expira
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge color="apto" variant="light" radius="sm" tt="none">
          Em dia
        </Badge>
      </Table.Td>
      <Table.Td style={{ textAlign: 'right' }}>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" disabled={busy} aria-label="Ações do atestado">
              <IconDotsVertical size={17} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
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
