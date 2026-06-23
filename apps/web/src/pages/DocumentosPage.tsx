import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  RingProgress,
  Select,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconCheck,
  IconExclamationMark,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import { fmtDate } from '../lib/format';
import {
  contarDocumentos,
  type DocStatus,
  MOCK_CHECKLIST_EXIGENCIAS,
  MOCK_DOCUMENTOS,
  MOCK_EDITAIS_SAMPLE,
  type MockDocumento,
  prontidaoHabilitacao,
} from '../mocks';

interface StatusStyle {
  tag: string;
  color: string;
  acao: string;
  icon: ReactNode;
}

const STATUS_STYLE: Record<DocStatus, StatusStyle> = {
  valido: { tag: 'Válido', color: 'green', acao: 'Ver', icon: <IconCheck size={12} /> },
  vencendo: {
    tag: 'Vence em breve',
    color: 'orange',
    acao: 'Renovar',
    icon: <IconExclamationMark size={12} />,
  },
  vencido: { tag: 'Vencido', color: 'red', acao: 'Renovar', icon: <IconX size={12} /> },
  faltando: { tag: 'Faltando', color: 'gray', acao: 'Enviar', icon: <IconX size={12} /> },
};

function validadeLabel(doc: MockDocumento): string {
  if (doc.status === 'faltando') return 'Documento ainda não enviado';
  if (!doc.validade) return 'Sem data de validade';
  if (doc.status === 'vencido') return `Venceu em ${fmtDate(doc.validade)}`;
  return `Válido até ${fmtDate(doc.validade)}`;
}

export function DocumentosPage() {
  const [editalId, setEditalId] = useState<string | null>(null);

  const counts = contarDocumentos(MOCK_DOCUMENTOS);
  const prontidao = prontidaoHabilitacao(MOCK_DOCUMENTOS);
  const resumo = `${counts.valido} válidos · ${counts.vencendo} vencendo · ${counts.vencido} vencido · ${counts.faltando} faltando`;

  const editalOptions = MOCK_EDITAIS_SAMPLE.map((e) => ({
    value: e.id,
    label: `${e.municipioNome}/${e.uf} — ${e.objeto.slice(0, 48)}…`,
  }));
  const editalSelecionado = MOCK_EDITAIS_SAMPLE.find((e) => e.id === editalId);

  const exigencias = MOCK_CHECKLIST_EXIGENCIAS.map((x) => {
    const doc = MOCK_DOCUMENTOS.find((d) => d.nome === x.doc);
    const status: DocStatus = doc?.status ?? 'faltando';
    const style = STATUS_STYLE[status];
    return {
      req: x.req,
      tag: status === 'faltando' ? 'Pendente' : style.tag,
      color: status === 'faltando' ? 'red' : style.color,
      icon: style.icon,
      ok: status === 'valido',
    };
  });
  const atende = exigencias.filter((x) => x.ok).length;

  return (
    <Box style={{ flex: 1 }} px="xl" py="lg" pb={44}>
      <Box maw={980} mx="auto">
        {/* prontidão */}
        <Card withBorder radius="lg" p="xl" mb="lg">
          <Group gap="lg">
            <RingProgress
              size={90}
              thickness={8}
              roundCaps
              sections={[{ value: prontidao, color: 'orange' }]}
            />
            <Box>
              <Text fz={13} c="dimmed">
                Prontidão de habilitação
              </Text>
              <Text fz={30} fw={800} lh={1.1}>
                {prontidao}%
              </Text>
              <Text fz={13.5} c="gray.7" mt={4}>
                {resumo}
              </Text>
            </Box>
          </Group>
        </Card>

        {/* cofre */}
        <Text fz={15} fw={700} mb="sm">
          Cofre de documentos
        </Text>
        <Card withBorder radius="md" p={0}>
          {MOCK_DOCUMENTOS.map((doc, i) => {
            const style = STATUS_STYLE[doc.status];
            return (
              <Group
                key={doc.nome}
                gap="md"
                wrap="nowrap"
                p="md"
                style={{
                  borderBottom:
                    i < MOCK_DOCUMENTOS.length - 1
                      ? '1px solid var(--mantine-color-gray-1)'
                      : undefined,
                }}
              >
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text fz={14} fw={600}>
                    {doc.nome}
                  </Text>
                  <Text fz={12} c="dimmed" mt={2}>
                    {validadeLabel(doc)}
                  </Text>
                </Box>
                <Badge color={style.color} variant="light" radius="xl" tt="none" style={{ flex: 'none' }}>
                  {style.tag}
                </Badge>
                <Button variant="default" size="xs" style={{ flex: 'none' }}>
                  {style.acao}
                </Button>
              </Group>
            );
          })}
        </Card>

        {/* upload */}
        <Card
          radius="md"
          p="lg"
          mt="md"
          style={{ border: '2px dashed var(--mantine-color-gray-4)' }}
        >
          <Stack align="center" gap={4}>
            <ThemeIcon variant="light" color="gray" radius="xl" size={40}>
              <IconUpload size={20} />
            </ThemeIcon>
            <Text fz={13.5} fw={600} c="gray.7">
              Arraste um arquivo ou clique para enviar um novo documento
            </Text>
            <Text fz={12} c="gray.5">
              PDF, JPG ou PNG · até 10 MB
            </Text>
          </Stack>
        </Card>

        {/* checklist por edital */}
        <Text fz={15} fw={700} mt="xl" mb={4}>
          Checklist de habilitação por edital
        </Text>
        <Text fz={13} c="dimmed" mb="sm">
          Escolha um edital para cruzar as exigências de habilitação com os documentos do seu cofre.
        </Text>
        <Select
          placeholder="Selecione um edital…"
          data={editalOptions}
          value={editalId}
          onChange={setEditalId}
          maw={560}
          clearable
        />

        {editalSelecionado && (
          <Card withBorder radius="md" p="lg" mt="md">
            <Group
              justify="space-between"
              wrap="nowrap"
              pb="sm"
              mb={6}
              style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}
            >
              <Box style={{ minWidth: 0 }}>
                <Text fz={14} fw={600} style={{ lineHeight: 1.35 }}>
                  {editalSelecionado.objeto}
                </Text>
                <Text fz={12.5} c="dimmed" mt={2}>
                  {editalSelecionado.municipioNome} / {editalSelecionado.uf}
                </Text>
              </Box>
              <Text fz={13} fw={700} c="orange.8" style={{ flex: 'none', whiteSpace: 'nowrap' }}>
                {atende} de {exigencias.length} exigências atendidas
              </Text>
            </Group>
            {exigencias.map((x) => (
              <Group
                key={x.req}
                gap="sm"
                wrap="nowrap"
                py={11}
                style={{ borderBottom: '1px solid var(--mantine-color-gray-0)' }}
              >
                <ThemeIcon variant="light" color={x.color} radius="xl" size={22} style={{ flex: 'none' }}>
                  {x.icon}
                </ThemeIcon>
                <Text fz={13.5} c="gray.7" style={{ flex: 1 }}>
                  {x.req}
                </Text>
                <Badge color={x.color} variant="light" radius="xl" tt="none" style={{ flex: 'none' }}>
                  {x.tag}
                </Badge>
              </Group>
            ))}
          </Card>
        )}
      </Box>
    </Box>
  );
}
