import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  type Icon,
  IconCalendar,
  IconChecklist,
  IconFileSpreadsheet,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
} from '@tabler/icons-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useEditaisSearch } from '../hooks/useEditaisSearch';
import { brl, daysUntil } from '../lib/format';
import {
  contarDocumentos,
  MOCK_DOCUMENTOS,
  MOCK_PRAZOS,
  prontidaoHabilitacao,
} from '../mocks';
import classes from '../styles/cards.module.css';

interface ModuleCard {
  icon: Icon;
  title: string;
  description: string;
  to: string;
}

const MODULES: ModuleCard[] = [
  {
    icon: IconSearch,
    title: 'Buscar editais',
    description: 'Filtre obras públicas por região, valor e período. Só obra pública.',
    to: '/editais',
  },
  {
    icon: IconSparkles,
    title: 'Resumo com IA',
    description: 'Entenda o edital em segundos: objeto, exigências e riscos.',
    to: '/editais',
  },
  {
    icon: IconShieldCheck,
    title: 'Prontidão & match',
    description: 'Veja se o perfil da empresa atende às exigências da obra.',
    to: '/documentos',
  },
  {
    icon: IconChecklist,
    title: 'Checklist de habilitação',
    description: 'O cofre cruza seus documentos com o que o edital exige.',
    to: '/documentos',
  },
  {
    icon: IconFileSpreadsheet,
    title: 'Orçamentos',
    description: 'Monte a planilha de preços com BDI e exporte sua proposta.',
    to: '/orcamentos',
  },
  {
    icon: IconCalendar,
    title: 'Agenda de prazos',
    description: 'Sessão, impugnação e entrega de proposta sem perder data.',
    to: '/agenda',
  },
];

function StatCard({
  label,
  value,
  hint,
  to,
  danger,
}: {
  label: string;
  value: string;
  hint: string;
  to: string;
  danger?: boolean;
}) {
  return (
    <Card
      component={Link}
      to={to}
      withBorder
      radius="md"
      p="lg"
      td="none"
      c="inherit"
      className={classes.hoverCard}
    >
      <Text fz={12} c="dimmed" mb="xs">
        {label}
      </Text>
      <Text fz={28} fw={800} lh={1} c={danger ? 'red.8' : undefined}>
        {value}
      </Text>
      <Text fz={12} fw={600} c="orange.8" mt="xs">
        {hint}
      </Text>
    </Card>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const nomeCurto = user?.name?.split(/\s+/).slice(0, 2).join(' ') ?? 'empreiteiro';
  const uf = user?.uf ?? null;

  // Dados reais da região do usuário (contagem + recentes). Demais widgets da
  // home (prazos, prontidão, documentos) ainda são placeholders mockados.
  const regiaoParams = useMemo(
    () => ({ uf: uf ?? undefined, page: 1, pageSize: 3 }),
    [uf],
  );
  const { state } = useEditaisSearch(regiaoParams);
  const regiaoCount = state.status === 'success' ? state.result.total : null;
  const recentes = state.status === 'success' ? state.result.data : [];

  const docCounts = contarDocumentos(MOCK_DOCUMENTOS);
  const prontidao = prontidaoHabilitacao(MOCK_DOCUMENTOS);
  const prazosUrgentes = MOCK_PRAZOS.filter((p) => {
    const d = daysUntil(p.data);
    return d >= 0 && d <= 7;
  }).length;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/editais?q=${encodeURIComponent(trimmed)}` : '/editais');
  }

  function semanaPassadaISO(): string {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().slice(0, 10);
  }

  return (
    <Box style={{ flex: 1 }} px="xl" py="lg" pb={48}>
      <Box maw={1100} mx="auto">
        <Box mb="lg">
          <Title order={1} fz={23}>
            Bem-vindo, {nomeCurto}
          </Title>
          <Text c="dimmed" fz="sm" mt={3}>
            {uf ? `${uf} · ` : ''}
            {user?.porte ? `Porte ${user.porte} · ` : ''}
            {regiaoCount != null
              ? `${regiaoCount} editais de obra pública na sua região`
              : 'Editais de obra pública na sua região'}
          </Text>
        </Box>

        {/* hero de busca */}
        <Card
          radius="lg"
          p="xl"
          mb="lg"
          bg="orange.0"
          style={{ border: '1px solid var(--mantine-color-orange-1)' }}
        >
          <Text fz={18} fw={700} c="#7a3208" mb={4}>
            Encontre obras públicas para a sua empresa
          </Text>
          <Text fz={13.5} c="#9a5a2b" mb="md">
            Busca focada exclusivamente em licitações de obra pública (fonte PNCP).
          </Text>
          <form onSubmit={submitSearch}>
            <Group gap="sm" maw={680} wrap="nowrap">
              <Box style={{ flex: 1 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                  placeholder="Buscar no objeto: pavimentação, escola, ponte…"
                  style={{
                    width: '100%',
                    height: 46,
                    border: '1px solid var(--mantine-color-orange-2)',
                    borderRadius: 9,
                    padding: '0 14px',
                    fontSize: 15,
                    fontFamily: 'inherit',
                    outline: 'none',
                    background: 'var(--mantine-color-white)',
                  }}
                />
              </Box>
              <Button type="submit" size="md" style={{ flex: 'none' }}>
                Buscar
              </Button>
            </Group>
          </form>
          <Group gap="xs" mt="md">
            {uf && (
              <Badge
                component={Link}
                to={`/editais?uf=${uf}`}
                variant="white"
                color="orange.9"
                radius="xl"
                tt="none"
                style={{ cursor: 'pointer', border: '1px solid var(--mantine-color-orange-2)' }}
              >
                Minha região ({uf})
              </Badge>
            )}
            <Badge
              component={Link}
              to="/editais?valorMax=80000"
              variant="white"
              color="orange.9"
              radius="xl"
              tt="none"
              style={{ cursor: 'pointer', border: '1px solid var(--mantine-color-orange-2)' }}
            >
              Até R$ 80 mil (ME/EPP)
            </Badge>
            <Badge
              component={Link}
              to={`/editais?dataInicio=${semanaPassadaISO()}`}
              variant="white"
              color="orange.9"
              radius="xl"
              tt="none"
              style={{ cursor: 'pointer', border: '1px solid var(--mantine-color-orange-2)' }}
            >
              Publicados esta semana
            </Badge>
          </Group>
        </Card>

        {/* stat cards */}
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" mb="xl">
          <StatCard
            label="Editais na sua região"
            value={regiaoCount != null ? String(regiaoCount) : '—'}
            hint={`Ver editais${uf ? ` em ${uf}` : ''} →`}
            to={uf ? `/editais?uf=${uf}` : '/editais'}
          />
          <StatCard
            label="Prazos encerrando"
            value={String(prazosUrgentes)}
            hint="Ver agenda →"
            to="/agenda"
            danger
          />
          <StatCard
            label="Prontidão do perfil"
            value={`${prontidao}%`}
            hint="Melhorar prontidão →"
            to="/documentos"
          />
          <StatCard
            label="Documentos válidos"
            value={`${docCounts.valido}/${MOCK_DOCUMENTOS.length}`}
            hint="Abrir cofre →"
            to="/documentos"
          />
        </SimpleGrid>

        {/* módulos */}
        <Text fz={15} fw={700} mb="sm">
          Tudo o que você precisa para participar
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" mb="xl">
          {MODULES.map((mod) => {
            const ModIcon = mod.icon;
            return (
              <Card
                key={mod.title}
                component={Link}
                to={mod.to}
                withBorder
                radius="md"
                p="lg"
                td="none"
                c="inherit"
                className={classes.hoverCard}
              >
                <ThemeIcon variant="light" color="orange" radius="md" size={42} mb="sm">
                  <ModIcon size={22} stroke={1.6} />
                </ThemeIcon>
                <Text fz={15} fw={700} mb={4}>
                  {mod.title}
                </Text>
                <Text fz={13} c="dimmed" style={{ lineHeight: 1.45 }}>
                  {mod.description}
                </Text>
              </Card>
            );
          })}
        </SimpleGrid>

        {/* prazos + recentes */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Box>
            <Group justify="space-between" mb="xs">
              <Text fz={15} fw={700}>
                Prazos encerrando
              </Text>
              <Anchor component={Link} to="/agenda" fz={13} fw={600}>
                Ver todos
              </Anchor>
            </Group>
            <Card withBorder radius="md" p={0}>
              {MOCK_PRAZOS.map((prazo, i) => {
                const date = new Date(`${prazo.data}T00:00:00`);
                return (
                  <Group
                    key={i}
                    gap="sm"
                    wrap="nowrap"
                    p="md"
                    style={{
                      borderBottom:
                        i < MOCK_PRAZOS.length - 1
                          ? '1px solid var(--mantine-color-gray-1)'
                          : undefined,
                    }}
                  >
                    <Box
                      ta="center"
                      w={46}
                      py={5}
                      style={{
                        flex: 'none',
                        background: 'var(--mantine-color-red-0)',
                        border: '1px solid var(--mantine-color-red-2)',
                        borderRadius: 8,
                      }}
                    >
                      <Text fz={17} fw={800} c="red.8" lh={1}>
                        {date.getDate()}
                      </Text>
                      <Text fz={10} fw={700} c="red.8" tt="uppercase">
                        {date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                      </Text>
                    </Box>
                    <Box style={{ minWidth: 0 }}>
                      <Text
                        fz={11}
                        fw={700}
                        c="orange.8"
                        tt="uppercase"
                        style={{ letterSpacing: 0.3 }}
                      >
                        {prazo.tipo}
                      </Text>
                      <Text fz={13} lineClamp={1} mt={2}>
                        {prazo.objeto}
                      </Text>
                    </Box>
                  </Group>
                );
              })}
            </Card>
          </Box>

          <Box>
            <Group justify="space-between" mb="xs">
              <Text fz={15} fw={700}>
                Editais recentes na sua região
              </Text>
              <Anchor component={Link} to={uf ? `/editais?uf=${uf}` : '/editais'} fz={13} fw={600}>
                Ver todos
              </Anchor>
            </Group>
            <Stack gap="sm">
              {recentes.length === 0 && (
                <Card withBorder radius="md" p="lg">
                  <Text fz={13} c="dimmed">
                    {state.status === 'loading'
                      ? 'Carregando editais da sua região…'
                      : 'Nenhum edital recente encontrado na sua região.'}
                  </Text>
                </Card>
              )}
              {recentes.map((edital) => (
                <Card
                  key={edital.id}
                  component={Link}
                  to={`/editais/${edital.id}`}
                  withBorder
                  radius="md"
                  p="md"
                  td="none"
                  c="inherit"
                  className={classes.hoverCard}
                >
                  <Text fz={13.5} fw={600} lineClamp={2} style={{ lineHeight: 1.35 }}>
                    {edital.objeto}
                  </Text>
                  <Group justify="space-between" mt="xs" gap="sm">
                    <Text fz={12} c="dimmed">
                      {edital.municipioNome} / {edital.uf}
                    </Text>
                    <Text fz={13} fw={700}>
                      {brl(edital.valorEstimado)}
                    </Text>
                  </Group>
                </Card>
              ))}
            </Stack>
          </Box>
        </SimpleGrid>

        <Text fz={11} c="dimmed" mt="xl">
          Prazos, prontidão e documentos exibidos acima são dados de exemplo —
          os módulos correspondentes ainda estão em construção. A busca de
          editais e o detalhe usam dados reais.
        </Text>
      </Box>
    </Box>
  );
}
