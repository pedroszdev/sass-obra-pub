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
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarExclamation,
  IconCircleCheck,
  IconFileText,
  IconRefresh,
  IconSearch,
  IconSparkles,
} from '@tabler/icons-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useCompanyProfile } from '../hooks/useCompanyProfile';
import { useEditaisSearch } from '../hooks/useEditaisSearch';
import { useProntidao } from '../hooks/useProntidao';
import { useAgenda } from '../hooks/useAgenda';
import { usePropostas } from '../hooks/usePropostas';
import {
  CERTIDAO_TIPO_LABELS,
  certidaoAlertas,
  EMISSAO_CERTIDAO_URL,
  validadeStatus,
} from '../lib/certidao';
import { brlCompact, daysUntil } from '../lib/format';
import type { BuscaResultItem, Veredito } from '../types/edital';
import classes from '../styles/cards.module.css';

// Card do "Precisa da sua atenção". `to` = rota interna; `href` = emissão externa
// (T-111, nova aba). Cada card tem um ou outro.
type AtencaoCard = {
  key: string;
  color: 'alerta' | 'orange';
  icon: typeof IconAlertTriangle;
  title: string;
  detail: string;
  action: string;
  to?: string;
  href?: string;
};

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function dataCurta(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10).split('-').reverse().join('/');
}

const VEREDITO_META: Record<Veredito, { label: string; color: string }> = {
  apto: { label: 'Você está apto', color: 'apto' },
  quase: { label: 'Quase lá', color: 'orange' },
  nao_apto: { label: 'Falta doc', color: 'alerta' },
  indefinido: { label: 'Sem dados p/ verificar', color: 'gray' },
};

/** Badge de aptidão — só renderiza quando há veredito real (T-53). */
function VereditoBadge({ veredito }: { veredito?: Veredito | null }) {
  if (!veredito) return null;
  const meta = VEREDITO_META[veredito];
  return (
    <Badge color={meta.color} variant="light" radius="sm" tt="none">
      {meta.label}
    </Badge>
  );
}

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
      <Text fz={30} fw={800} lh={1} c={danger ? 'alerta.8' : undefined}>
        {value}
      </Text>
      <Text fz={12} fw={600} c="orange.8" mt="xs">
        {hint}
      </Text>
    </Card>
  );
}

function ObraRow({ edital }: { edital: BuscaResultItem }) {
  const dias = daysUntil(edital.prazoProposta);
  const temPrazo = Number.isFinite(dias);
  const prazoLabel = !temPrazo
    ? null
    : dias < 0
      ? 'Encerrado'
      : dias === 0
        ? 'Hoje'
        : `${dias} dias`;
  const prazoCor = temPrazo && dias >= 0 && dias <= 3 ? 'alerta.7' : 'dimmed';
  return (
    <Card
      component={Link}
      to={`/editais/${edital.id}`}
      withBorder
      radius="md"
      p="md"
      td="none"
      c="inherit"
      className={classes.hoverCard}
    >
      <Group justify="space-between" wrap="nowrap" gap="md" align="flex-start">
        <Box style={{ minWidth: 0 }}>
          <Text fz={14} fw={600} lineClamp={1} style={{ lineHeight: 1.3 }}>
            {edital.objeto}
          </Text>
          <Text fz={12} c="dimmed" mt={3} lineClamp={1}>
            {edital.municipioNome} / {edital.uf} · {edital.modalidadeNome}
          </Text>
        </Box>
        <Stack gap={6} align="flex-end" style={{ flex: 'none' }}>
          <Text fz={13.5} fw={700}>
            {brlCompact(edital.valorEstimado)}
          </Text>
          <Group gap={6} wrap="nowrap">
            <VereditoBadge veredito={edital.veredito} />
            {prazoLabel && (
              <Text fz={12} fw={600} c={prazoCor}>
                {prazoLabel}
              </Text>
            )}
          </Group>
        </Stack>
      </Group>
    </Card>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const primeiroNome = user?.name?.trim().split(/\s+/)[0] ?? 'empreiteiro';
  const uf = user?.uf ?? null;

  // Dados reais da região (contagem + recentes).
  // uf é multi no contrato da busca (T-81) — aqui mandamos uma só (a do usuário).
  const regiaoParams = useMemo(
    () => ({ uf: uf ? [uf] : undefined, page: 1, pageSize: 4 }),
    [uf],
  );
  const { state, reload } = useEditaisSearch(regiaoParams);
  const regiaoCount = state.status === 'success' ? state.result.total : null;
  const recentes = state.status === 'success' ? state.result.data : [];
  const destaque = recentes[0] ?? null;
  const lista = recentes.slice(1, 4);

  // Certidões reais do cofre (alerta de vencimento + card de válidas).
  const { state: profileState } = useCompanyProfile();
  const certidoes =
    profileState.status === 'success' ? profileState.data.certidoes : [];
  const certidoesValidas = certidoes.filter(
    (c) => validadeStatus(c.dataValidade) === 'valido',
  ).length;
  const alertas = certidaoAlertas(certidoes);

  // Prontidão genérica real (T-45/T-46).
  const { state: prontidaoState } = useProntidao();
  const prontidaoPct =
    prontidaoState.status === 'success' ? prontidaoState.data.percentual : null;

  // Agenda real (T-91) — prazos de entrega de proposta para "atenção"/resumo.
  const { state: agendaState } = useAgenda();

  // Propostas em rascunho (T-60+) — entram em "Precisa da sua atenção".
  const { state: propostasState } = usePropostas();
  const rascunhos =
    propostasState.status === 'success'
      ? propostasState.data.filter((p) => p.status === 'rascunho')
      : [];

  // Prazos de entrega de proposta encerrando esta semana (T-91). Vencimento de
  // certidão fica de fora aqui — já tem bloco próprio (alertas) logo acima.
  const prazosUrgentes =
    agendaState.status === 'success'
      ? agendaState.data.filter((e) => {
          if (e.tipo !== 'entrega_proposta') return false;
          const d = daysUntil(e.data);
          return d >= 0 && d <= 7;
        })
      : [];

  // "Precisa da sua atenção": certidões vencidas/vencendo + prazos próximos.
  const atencao: AtencaoCard[] = [
    ...alertas.vencidas.map((c): AtencaoCard => {
      const emitir = EMISSAO_CERTIDAO_URL[c.tipo];
      return {
        key: `cert-venc-${c.id}`,
        color: 'alerta',
        icon: IconAlertTriangle,
        title: `${CERTIDAO_TIPO_LABELS[c.tipo]} vencida`,
        detail: emitir
          ? 'Emita a certidão atualizada.'
          : 'Renove pra não ser desclassificado.',
        action: emitir ? 'Emitir' : 'Renovar',
        ...(emitir ? { href: emitir } : { to: '/documentos' }),
      };
    }),
    ...alertas.vencendo.map((c): AtencaoCard => {
      const d = daysUntil(c.dataValidade);
      const emitir = EMISSAO_CERTIDAO_URL[c.tipo];
      return {
        key: `cert-vence-${c.id}`,
        color: 'orange',
        icon: IconAlertTriangle,
        title: `${CERTIDAO_TIPO_LABELS[c.tipo]} vence em ${d} dias`,
        detail: emitir
          ? 'Emita a certidão atualizada antes de vencer.'
          : 'Renove antes de perder a validade.',
        action: emitir ? 'Emitir' : 'Renovar',
        ...(emitir ? { href: emitir } : { to: '/documentos' }),
      };
    }),
    ...prazosUrgentes.map(
      (p, i): AtencaoCard => ({
        key: `prazo-${i}`,
        color: 'orange',
        icon: IconCalendarExclamation,
        title: `Entrega da proposta: ${p.titulo}`,
        detail: `Faltam ${daysUntil(p.data)} dias.`,
        action: 'Ver agenda',
        to: '/agenda',
      }),
    ),
    ...rascunhos.map(
      (p): AtencaoCard => ({
        key: `rasc-${p.id}`,
        color: 'orange',
        icon: IconFileText,
        title: `Proposta em rascunho: ${p.titulo}`,
        detail: 'Continue de onde você parou.',
        action: 'Continuar',
        to: `/orcamentos/${p.id}`,
      }),
    ),
  ];

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

  const resumoLinha = [
    regiaoCount != null
      ? `${regiaoCount} ${regiaoCount === 1 ? 'obra' : 'obras'} de obra pública na sua região`
      : 'Obras de obra pública na sua região',
    prazosUrgentes.length
      ? `${prazosUrgentes.length} ${prazosUrgentes.length === 1 ? 'prazo' : 'prazos'} encerrando esta semana`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const diasDestaque = daysUntil(destaque?.prazoProposta ?? null);
  const temPrazoDestaque = Number.isFinite(diasDestaque) && diasDestaque >= 0;

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={48}>
      <Box maw={1140} mx="auto">
        {/* saudação */}
        <Box mb="lg">
          <Title order={1} fz={30} style={{ letterSpacing: '-0.02em' }}>
            {saudacao()}, {primeiroNome}.
          </Title>
          <Text c="dimmed" fz="sm" mt={4}>
            {resumoLinha}
          </Text>
        </Box>

        {/* busca */}
        <form onSubmit={submitSearch}>
          <Group gap="sm" wrap="nowrap" mb="sm">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Buscar obra: pavimentação, escola, ponte…"
              leftSection={<IconSearch size={17} />}
              size="md"
              radius="md"
              style={{ flex: 1 }}
            />
            <Button type="submit" size="md" style={{ flex: 'none' }}>
              Buscar
            </Button>
          </Group>
        </form>
        <Group gap="xs" mb="xl">
          {uf && (
            <Badge
              component={Link}
              to={`/editais?uf=${uf}`}
              variant="default"
              radius="xl"
              tt="none"
              style={{ cursor: 'pointer' }}
            >
              Minha região ({uf})
            </Badge>
          )}
          <Badge
            component={Link}
            to="/editais?valorMax=80000"
            variant="default"
            radius="xl"
            tt="none"
            style={{ cursor: 'pointer' }}
          >
            Até R$ 80 mil (ME/EPP)
          </Badge>
          <Badge
            component={Link}
            to={`/editais?dataInicio=${semanaPassadaISO()}`}
            variant="default"
            radius="xl"
            tt="none"
            style={{ cursor: 'pointer' }}
          >
            Publicados esta semana
          </Badge>
        </Group>

        {/* card de destaque — melhor obra pra você hoje */}
        {destaque ? (
          <Card radius="lg" p="xl" mb="xl" bg="graphite.9" c="concreto.2">
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
              <Box style={{ flex: 1, minWidth: 240 }}>
                <Text
                  fz={11}
                  fw={500}
                  c="orange.6"
                  mb={8}
                  style={{
                    fontFamily: 'var(--mantine-font-family-monospace)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  Melhor obra pra você hoje
                </Text>
                <Title order={2} fz={24} c="concreto.0" lineClamp={2} style={{ letterSpacing: '-0.01em' }}>
                  {destaque.objeto}
                </Title>
                <Text fz={13.5} c="concreto.5" mt={6}>
                  {destaque.orgaoNome} · {destaque.municipioNome} / {destaque.uf}
                </Text>
                <Group gap="sm" mt="md">
                  {destaque.valorEstimado != null && (
                    <Badge color="orange" variant="light" radius="sm" tt="none">
                      {brlCompact(destaque.valorEstimado)}
                    </Badge>
                  )}
                  <VereditoBadge veredito={destaque.veredito} />
                  <Badge color="gray" variant="light" radius="sm" tt="none">
                    {destaque.modalidadeNome}
                  </Badge>
                  {destaque.resumoPronto && (
                    <Badge
                      color="orange"
                      variant="light"
                      radius="sm"
                      tt="none"
                      leftSection={<IconSparkles size={12} />}
                    >
                      Resumo IA pronto
                    </Badge>
                  )}
                </Group>
              </Box>

              <Stack gap="xs" align="flex-end" style={{ flex: 'none' }}>
                {temPrazoDestaque && (
                  <Box ta="right">
                    <Text fz={11} c="concreto.6" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                      Proposta encerra em
                    </Text>
                    <Text fz={30} fw={800} c="orange.5" lh={1.1}>
                      {diasDestaque === 0 ? 'hoje' : `${diasDestaque} dias`}
                    </Text>
                    {destaque.prazoProposta && (
                      <Text fz={12} c="concreto.6">
                        {dataCurta(destaque.prazoProposta)}
                      </Text>
                    )}
                  </Box>
                )}
                <Button
                  component={Link}
                  to={`/editais/${destaque.id}`}
                  color="orange"
                  mt={4}
                >
                  Montar proposta
                </Button>
                <Anchor
                  component={Link}
                  to={`/editais/${destaque.id}`}
                  c="concreto.5"
                  fz={13}
                  fw={600}
                >
                  Ver resumo do edital →
                </Anchor>
              </Stack>
            </Group>
          </Card>
        ) : state.status === 'error' ? (
          <Card withBorder radius="lg" p="xl" mb="xl">
            <Group gap="sm" mb={4}>
              <ThemeIcon color="alerta" variant="light" radius="md" size={34}>
                <IconAlertTriangle size={18} />
              </ThemeIcon>
              <Text fz={15} fw={700}>
                Não deu pra carregar as obras da sua região
              </Text>
            </Group>
            <Text fz={13.5} c="dimmed" mt={4} mb="md">
              {state.message}
            </Text>
            <Button variant="default" onClick={reload} leftSection={<IconRefresh size={16} />}>
              Tentar de novo
            </Button>
          </Card>
        ) : (
          <Card withBorder radius="lg" p="xl" mb="xl">
            <Text fz={15} fw={700}>
              Vamos achar a sua próxima obra
            </Text>
            <Text fz={13.5} c="dimmed" mt={4} mb="md">
              {state.status === 'loading'
                ? 'Carregando editais da sua região…'
                : 'Busque licitações de obra pública na sua região pra começar.'}
            </Text>
            <Button component={Link} to="/editais" rightSection={<IconArrowRight size={16} />}>
              Buscar editais
            </Button>
          </Card>
        )}

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
            value={String(prazosUrgentes.length)}
            hint="Ver agenda →"
            to="/agenda"
            danger={prazosUrgentes.length > 0}
          />
          <StatCard
            label="Prontidão do perfil"
            value={prontidaoPct != null ? `${prontidaoPct}%` : '—'}
            hint="Melhorar prontidão →"
            to="/documentos"
          />
          <StatCard
            label="Documentos válidos"
            value={
              profileState.status === 'success'
                ? `${certidoesValidas}/${certidoes.length}`
                : '—'
            }
            hint="Abrir cofre →"
            to="/documentos"
          />
        </SimpleGrid>

        {/* duas colunas */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Box>
            <Group justify="space-between" mb="sm">
              <Text fz={16} fw={700} ff="heading">
                Obras pra você hoje
              </Text>
              <Anchor
                component={Link}
                to={uf ? `/editais?uf=${uf}` : '/editais'}
                fz={13}
                fw={600}
              >
                Ver todas{regiaoCount != null ? ` as ${regiaoCount}` : ''}
              </Anchor>
            </Group>
            <Stack gap="sm">
              {lista.length === 0 && (
                <Card withBorder radius="md" p="lg">
                  <Text fz={13} c="dimmed">
                    {state.status === 'loading'
                      ? 'Carregando editais da sua região…'
                      : state.status === 'error'
                        ? 'Não foi possível carregar as obras da sua região.'
                        : 'Sem mais obras na sua região por enquanto.'}
                  </Text>
                </Card>
              )}
              {lista.map((edital) => (
                <ObraRow key={edital.id} edital={edital} />
              ))}
            </Stack>
          </Box>

          <Box>
            <Text fz={16} fw={700} ff="heading" mb="sm">
              Precisa da sua atenção
            </Text>
            {atencao.length === 0 ? (
              <Card withBorder radius="md" p="lg">
                <Group gap="sm">
                  <ThemeIcon color="apto" variant="light" radius="xl" size={36}>
                    <IconCircleCheck size={20} />
                  </ThemeIcon>
                  <Box>
                    <Text fz={14} fw={600}>
                      Tudo em dia
                    </Text>
                    <Text fz={12.5} c="dimmed">
                      Nenhum documento vencendo nem prazo apertado agora.
                    </Text>
                  </Box>
                </Group>
              </Card>
            ) : (
              <Stack gap="sm">
                {atencao.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <Card key={item.key} withBorder radius="md" p="md">
                      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
                        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                          <ThemeIcon color={item.color} variant="light" radius="md" size={34}>
                            <ItemIcon size={18} />
                          </ThemeIcon>
                          <Box style={{ minWidth: 0 }}>
                            <Text fz={13.5} fw={600} lineClamp={1}>
                              {item.title}
                            </Text>
                            <Text fz={12} c="dimmed" lineClamp={1}>
                              {item.detail}
                            </Text>
                          </Box>
                        </Group>
                        <Anchor
                          {...(item.href
                            ? {
                                href: item.href,
                                target: '_blank',
                                rel: 'noopener noreferrer',
                              }
                            : { component: Link, to: item.to ?? '#' })}
                          fz={12.5}
                          fw={600}
                          c={item.color === 'alerta' ? 'alerta.7' : 'orange.8'}
                          style={{ flex: 'none', whiteSpace: 'nowrap' }}
                        >
                          {item.action}
                        </Anchor>
                      </Group>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Box>
        </SimpleGrid>
      </Box>
    </Box>
  );
}
