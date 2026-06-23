import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconCheck,
  IconExclamationMark,
  IconExternalLink,
  IconSparkles,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '../components/StateViews';
import { useFavorites } from '../context/favorites-context';
import { useEdital } from '../hooks/useEdital';
import {
  prontidaoObra,
  type RiscoNivel,
  resumoIA,
  riscos,
} from '../lib/edital-insights';
import { brl, fmtDate, fmtDateTime, prazoFlags } from '../lib/format';
import type { EditalDetail } from '../types/edital';

const RISCO_COLOR: Record<RiscoNivel, string> = {
  alto: 'red',
  medio: 'orange',
  baixo: 'green',
};
const RISCO_LABEL: Record<RiscoNivel, string> = {
  alto: 'Alto',
  medio: 'Médio',
  baixo: 'Baixo',
};

function StatCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card
      withBorder
      radius="md"
      p="md"
      bg={highlight ? 'red.0' : undefined}
      style={highlight ? { borderColor: 'var(--mantine-color-red-2)' } : undefined}
    >
      <Text
        fz={11}
        tt="uppercase"
        fw={500}
        c={highlight ? 'red.8' : 'dimmed'}
        style={{ letterSpacing: 0.4 }}
        mb={6}
      >
        {label}
      </Text>
      <Text fz={19} fw={700} c={highlight ? 'red.8' : undefined}>
        {value}
      </Text>
      {hint && (
        <Text fz={12} fw={600} c="red.8" mt={2}>
          {hint}
        </Text>
      )}
    </Card>
  );
}

function DetailContent({ edital }: { edital: EditalDetail }) {
  const navigate = useNavigate();
  const { isFavorito, toggle } = useFavorites();
  const fav = isFavorito(edital.id);
  const prazo = prazoFlags(edital.prazoProposta);
  const insights = riscos(edital);
  const prontidao = prontidaoObra();

  const rows: [string, string][] = [
    ['Órgão', edital.orgaoNome],
    ['CNPJ', edital.orgaoCnpj ?? 'Não informado'],
    ['Município / UF', `${edital.municipioNome} / ${edital.uf}`],
    ['Código IBGE', edital.codigoIbge ?? '—'],
    ['Modalidade', edital.modalidadeNome],
    ['Situação', edital.situacao ?? '—'],
    ['Fonte', edital.fonte],
    ['Identificador', edital.id],
    ['Capturado em', fmtDateTime(edital.createdAt)],
    ['Atualizado em', fmtDateTime(edital.updatedAt)],
  ];

  return (
    <Stack gap="sm">
      {/* cabeçalho */}
      <Card withBorder radius="lg" p="xl">
        <Group gap="xs">
          <Badge color="orange" variant="light" radius="xl">
            {edital.modalidadeNome}
          </Badge>
          {edital.situacao && (
            <Badge color="gray" variant="light" radius="xl" tt="none">
              {edital.situacao}
            </Badge>
          )}
          <Badge color="gray" variant="light" radius="xl" tt="none">
            Fonte: {edital.fonte}
          </Badge>
        </Group>
        <Title order={1} fz={23} mt="md" mb="xs" style={{ lineHeight: 1.32 }}>
          {edital.objeto}
        </Title>
        <Text fz={15} fw={600}>
          {edital.orgaoNome}
        </Text>
        <Text fz={13.5} c="dimmed" mt={2}>
          {edital.municipioNome} / {edital.uf}
        </Text>
      </Card>

      {/* stat cards */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <StatCard label="Valor estimado" value={brl(edital.valorEstimado)} />
        <StatCard label="Data de publicação" value={fmtDate(edital.dataPublicacao)} />
        <StatCard
          label="Prazo da proposta"
          value={prazo.fmt}
          hint={prazo.urgente ? prazo.badge : undefined}
          highlight={prazo.urgente}
        />
      </SimpleGrid>

      {/* resumo com IA (placeholder — ver edital-insights.ts) */}
      <Card withBorder radius="lg" p="xl">
        <Group gap="sm" mb="sm">
          <ThemeIcon variant="light" color="orange" radius="sm" size={26}>
            <IconSparkles size={16} />
          </ThemeIcon>
          <Text fz={15} fw={700}>
            Resumo com IA
          </Text>
          <Badge color="gray" variant="light" radius="xl" size="sm" tt="uppercase">
            Gerado automaticamente
          </Badge>
        </Group>
        <Text fz={14} c="gray.7" mb="md" style={{ lineHeight: 1.6 }}>
          {resumoIA(edital)}
        </Text>
        <Text
          fz={12}
          fw={700}
          c="gray.7"
          tt="uppercase"
          mb="xs"
          style={{ letterSpacing: 0.4 }}
        >
          Pontos de atenção
        </Text>
        <Stack gap="xs">
          {insights.map((risco, i) => (
            <Group key={i} gap="sm" align="flex-start" wrap="nowrap">
              <Badge
                color={RISCO_COLOR[risco.nivel]}
                variant="light"
                radius="xl"
                w={58}
                style={{ flex: 'none' }}
              >
                {RISCO_LABEL[risco.nivel]}
              </Badge>
              <Text fz={13.5} c="gray.7" style={{ lineHeight: 1.45 }}>
                {risco.label}
              </Text>
            </Group>
          ))}
        </Stack>
      </Card>

      {/* prontidão (placeholder mockado — ver edital-insights.ts) */}
      <Card withBorder radius="lg" p="xl">
        <Group justify="space-between" mb="md">
          <Text fz={15} fw={700}>
            Prontidão da sua empresa para esta obra
          </Text>
          <Text fz={13} fw={700} c="orange.8">
            {prontidao.label}
          </Text>
        </Group>
        <Stack gap="sm">
          {prontidao.itens.map((item, i) => (
            <Group key={i} gap="sm" wrap="nowrap">
              <ThemeIcon
                variant="light"
                color={item.ok ? 'green' : 'orange'}
                radius="xl"
                size={20}
                style={{ flex: 'none' }}
              >
                {item.ok ? <IconCheck size={12} /> : <IconExclamationMark size={12} />}
              </ThemeIcon>
              <Text fz={13.5} c="gray.7">
                {item.label}
              </Text>
            </Group>
          ))}
        </Stack>
        <Button
          component={Link}
          to="/documentos"
          variant="default"
          size="xs"
          mt="md"
        >
          Revisar documentos no cofre
        </Button>
      </Card>

      {/* tabela de definições */}
      <Card withBorder radius="lg" px="xl" py={6}>
        {rows.map(([label, value]) => (
          <Group
            key={label}
            justify="space-between"
            wrap="nowrap"
            gap="xl"
            py="sm"
            style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}
          >
            <Text fz={13} c="dimmed" style={{ flex: 'none', width: 170 }}>
              {label}
            </Text>
            <Text fz={14} fw={500} ta="right" style={{ wordBreak: 'break-word' }}>
              {value}
            </Text>
          </Group>
        ))}
      </Card>

      {/* ações */}
      <Group gap="sm" mt="xs">
        <Button
          component="a"
          href={edital.linkOrigem ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          disabled={!edital.linkOrigem}
          rightSection={<IconExternalLink size={17} />}
        >
          Abrir documento na fonte
        </Button>
        <Button
          variant={fav ? 'filled' : 'outline'}
          color="orange"
          leftSection={
            fav ? <IconStarFilled size={17} /> : <IconStar size={17} />
          }
          onClick={() => toggle(edital)}
        >
          {fav ? 'Salvo' : 'Salvar edital'}
        </Button>
        <Button variant="default" onClick={() => navigate('/editais')}>
          Voltar à lista
        </Button>
      </Group>
    </Stack>
  );
}

function DetailSkeleton() {
  return (
    <Stack gap="sm">
      <Card withBorder radius="lg" p="xl">
        <Skeleton h={20} w={130} mb="md" />
        <Skeleton h={26} w="90%" mb="xs" />
        <Skeleton h={26} w="55%" />
      </Card>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        {[0, 1, 2].map((i) => (
          <Card key={i} withBorder radius="md" p="md">
            <Skeleton h={46} />
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export function EditalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, reload } = useEdital(id);

  return (
    <Box px={{ base: 'md', sm: 'lg' }} py="lg" style={{ flex: 1 }}>
      <Box maw={880} mx="auto">
        <Button
          variant="subtle"
          color="orange"
          size="compact-sm"
          px={0}
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate(-1)}
          mb="sm"
        >
          Voltar para a busca
        </Button>

        {state.status === 'loading' && <DetailSkeleton />}

        {state.status === 'error' &&
          (state.notFound ? (
            <ErrorState
              title="Edital não encontrado."
              description="Ele pode ter saído da base ou o endereço está incorreto."
            />
          ) : (
            <ErrorState
              title="Não foi possível carregar este edital."
              description={state.message}
              onRetry={reload}
            />
          ))}

        {state.status === 'success' && <DetailContent edital={state.edital} />}
      </Box>
    </Box>
  );
}
