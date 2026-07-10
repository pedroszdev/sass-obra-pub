import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarExclamation,
  IconCheck,
  IconCircleCheck,
  IconFileText,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconX,
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
} from '../lib/certidao';
import { brlCompact, daysUntil, fmtDateTime, fmtDiaSemana } from '../lib/format';
import type { BuscaResultItem, Veredito } from '../types/edital';
import type { AgendaEvento } from '../types/agenda';
import classes from '../styles/cards.module.css';
import { encurtarObjeto } from '../lib/objeto';

// Card do "Precisa da sua atenção". `to` = rota interna; `href` = emissão externa
// (T-111, nova aba). Cada card tem um ou outro. `ordem` = dias até o vencimento/
// prazo (T-96): vencidos ficam negativos (topo), rascunho vai pro fim (Infinity)
// — a ordenação por urgência cruza as categorias.
type AtencaoCard = {
  key: string;
  color: 'alerta' | 'orange';
  icon: typeof IconAlertTriangle;
  title: string;
  detail: string;
  action: string;
  ordem: number;
  to?: string;
  href?: string;
};

// Janela de prazo de entrega que a Home considera "precisa de atenção" (T-96).
// A Central de Alertas (T-90) usa a sua própria janela no BACKEND (≤14d) — as
// duas não podem compartilhar uma constante por viverem em camadas diferentes
// (dívida §10: tipos/constantes compartilhados ainda não moram em packages/).
const PRAZO_ENTREGA_DIAS = 7;
// Quantos itens o bloco mostra antes do "ver tudo" (→ Central de Alertas).
const ATENCAO_LIMITE = 4;
// Janela e teto do card "Sua semana" (prazos de qualquer tipo, não só entrega).
const SEMANA_DIAS = 7;
const SEMANA_LIMITE = 4;
// Abaixo disso o pontinho do evento fica laranja (aperta).
const SEMANA_URGENTE_DIAS = 3;
// Filtro rápido de valor dos chips: teto de contratação de ME/EPP.
const VALOR_MAX_ME_EPP = 80_000;

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "YYYY-MM-DD" de ontem — janela do "obras novas desde ontem". */
function ontemISO(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function semanaPassadaISO(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

// Chips de filtro rápido acima do card de destaque. Ligar/desligar não navega:
// compõem a busca que o botão "Buscar" leva pra /editais.
type ChipKey = 'regiao' | 'valor' | 'semana' | 'apto';
type Chips = Record<ChipKey, boolean>;

function FilterChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onToggle}
      className={classes.filterChip}
      data-active={active || undefined}
      aria-pressed={active}
    >
      {active ? null : <Text component="span" fz={13} fw={500} c="dimmed">+</Text>}
      {label}
      {active && <IconX size={13} stroke={2.4} />}
    </UnstyledButton>
  );
}

const VEREDITO_META: Record<Veredito, { label: string; color: string }> = {
  apto: { label: 'Você está apto', color: 'apto' },
  quase: { label: 'Quase lá', color: 'orange' },
  nao_apto: { label: 'Falta doc', color: 'alerta' },
  indefinido: { label: 'Sem dados p/ verificar', color: 'gray' },
};

// Ranking da Home (T-95): veredito "apto" primeiro; o resto mantém a ordem da
// API (recência) por ser sort estável. Sem nenhum apto → recência pura.
const aptoRank = (e: BuscaResultItem): number => (e.veredito === 'apto' ? 0 : 1);

/** Badge de aptidão — só renderiza quando há veredito real (T-53). */
function VereditoBadge({ veredito }: { veredito?: Veredito | null }) {
  if (!veredito) return null;
  const meta = VEREDITO_META[veredito];
  return (
    <Badge
      color={meta.color}
      variant="light"
      radius="sm"
      tt="none"
      leftSection={veredito === 'apto' ? <IconCheck size={12} stroke={3} /> : undefined}
    >
      {meta.label}
    </Badge>
  );
}

/**
 * Prontidão do perfil: percentual + o que falta enviar. A promessa numérica usa
 * o total de obras da REGIÃO (não "obras em que você seria apto" — esse número
 * não existe na API hoje; ver conversa de 10/07).
 */
function ProntidaoCard({
  percentual,
  pendencias,
  regiaoCount,
}: {
  percentual: number | null;
  /** Labels dos requisitos ainda não atendidos (do diagnóstico genérico). */
  pendencias: string[];
  regiaoCount: number | null;
}) {
  const pendentes = pendencias.slice(0, 2);
  const desbloqueio =
    regiaoCount != null ? (
      <>
        {' '}
        para desbloquear as <b>{regiaoCount} obras</b> da sua região.
      </>
    ) : (
      <> para ficar apto a mais obras.</>
    );

  return (
    <Card withBorder radius="lg" p="lg">
      <Group justify="space-between" align="baseline">
        <Text fz={15} fw={700} ff="heading">
          Prontidão do perfil
        </Text>
        <Text fz={22} fw={800} c="orange.8" lh={1}>
          {percentual != null ? `${percentual}%` : '—'}
        </Text>
      </Group>
      <Progress
        value={percentual ?? 0}
        color="orange.8"
        size="sm"
        radius="xl"
        mt="sm"
        aria-label="Prontidão do perfil"
      />
      <Text fz={13.5} c="dimmed" mt="md">
        {pendentes.length === 0 ? (
          <>Seu perfil está completo — nenhuma pendência de habilitação.</>
        ) : (
          <>
            Resolva{' '}
            {pendentes.map((p, i) => (
              <span key={p}>
                {i > 0 && ' e '}
                <Text component="b" c="graphite.9" fw={600}>
                  {p}
                </Text>
              </span>
            ))}
            {desbloqueio}
          </>
        )}
      </Text>
      <Anchor component={Link} to="/documentos" fz={13} fw={600} c="orange.8" mt="md" display="block">
        Enviar documentos →
      </Anchor>
    </Card>
  );
}

/** Uma linha do "Sua semana": "QUI 23 — encerra proposta em Passo de Torres". */
function eventoLinha(evento: AgendaEvento): string {
  switch (evento.tipo) {
    case 'entrega_proposta':
      return evento.subtitulo
        ? `encerra proposta em ${evento.subtitulo}`
        : 'encerra proposta';
    case 'certidao_vencimento':
      return `vence ${evento.titulo}`;
    default:
      return evento.titulo;
  }
}

/** Prazos dos próximos dias, de qualquer tipo (entrega, certidão, data do edital). */
function SemanaCard({ eventos, loading }: { eventos: AgendaEvento[]; loading: boolean }) {
  return (
    <Card withBorder radius="lg" p="lg">
      <Text fz={15} fw={700} ff="heading">
        Sua semana
      </Text>
      {eventos.length === 0 ? (
        <Text fz={13.5} c="dimmed" mt="md">
          {loading
            ? 'Carregando seus prazos…'
            : `Nenhum prazo nos próximos ${SEMANA_DIAS} dias.`}
        </Text>
      ) : (
        <Stack gap={8} mt="md">
          {eventos.map((evento) => {
            const urgente = daysUntil(evento.data) <= SEMANA_URGENTE_DIAS;
            return (
              <Group key={`${evento.tipo}-${evento.data}-${evento.titulo}`} gap={8} wrap="nowrap">
                <Box
                  w={7}
                  h={7}
                  style={{
                    flex: 'none',
                    borderRadius: '50%',
                    background: urgente
                      ? 'var(--mantine-color-orange-8)'
                      : 'var(--mantine-color-concreto-5)',
                  }}
                />
                <Text fz={13} c="dimmed" lineClamp={1}>
                  <Text component="span" ff="monospace" fz={12} fw={600} c="graphite.9">
                    {fmtDiaSemana(evento.data)}
                  </Text>{' '}
                  — {eventoLinha(evento)}
                </Text>
              </Group>
            );
          })}
        </Stack>
      )}
      <Anchor component={Link} to="/agenda" fz={13} fw={600} c="orange.8" mt="md" display="block">
        Ver agenda completa →
      </Anchor>
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
            {encurtarObjeto(edital.objeto)}
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
  // "Minha região" já vem ligado (é o recorte natural de quem abre a home); os
  // demais chips começam desligados pra não esconder obras logo de cara.
  const [chips, setChips] = useState<Chips>({
    regiao: true,
    valor: false,
    semana: false,
    apto: false,
  });
  const toggleChip = (key: ChipKey) =>
    setChips((prev) => ({ ...prev, [key]: !prev[key] }));

  const primeiroNome = user?.name?.trim().split(/\s+/)[0] ?? 'empreiteiro';
  const uf = user?.uf ?? null;

  // Municípios de atuação do usuário (T-94). Vazio = sem preferência.
  const codigoKey = (user?.municipios ?? []).map((m) => m.codigoIbge).join(',');

  // Contagem da região + atalho "Ver todas" continuam na UF INTEIRA (T-95),
  // mesmo com município configurado. pageSize 1: só precisamos do total.
  const regiaoParams = useMemo(
    () => ({ uf: uf ? [uf] : undefined, page: 1, pageSize: 1 }),
    [uf],
  );
  const { state: regiaoState } = useEditaisSearch(regiaoParams);
  const regiaoCount =
    regiaoState.status === 'success' ? regiaoState.result.total : null;

  // Linha da saudação: obras publicadas desde ontem na UF, e quantas delas o
  // usuário está apto a disputar. Duas contagens (pageSize 1, só o `total`) —
  // a segunda usa o filtro de aptidão (T-53), que já roda sobre o cache da IA.
  const desdeOntem = useMemo(() => ontemISO(), []);
  const novasParams = useMemo(
    () => ({
      uf: uf ? [uf] : undefined,
      dataInicio: desdeOntem,
      page: 1,
      pageSize: 1,
    }),
    [uf, desdeOntem],
  );
  const { state: novasState } = useEditaisSearch(novasParams);
  const { state: novasAptasState } = useEditaisSearch(novasParams, true);
  const novasCount =
    novasState.status === 'success' ? novasState.result.total : null;
  const novasAptasCount =
    novasAptasState.status === 'success' ? novasAptasState.result.total : null;

  // Pool para ranquear a Home (T-95): editais da UF, restritos aos municípios
  // preferidos (T-94) quando houver. pageSize maior para achar aptos e ainda
  // encher destaque + 3 linhas. O veredito/prazo/município já vêm no item (T-82).
  const poolParams = useMemo(
    () => ({
      uf: uf ? [uf] : undefined,
      codigoIbge: codigoKey ? codigoKey.split(',') : undefined,
      page: 1,
      pageSize: 20,
    }),
    [uf, codigoKey],
  );
  const { state: poolState, reload } = useEditaisSearch(poolParams);
  // Prioriza "apto"; recência como desempate (ver aptoRank). Destaque = 1º.
  const ranked = useMemo(() => {
    const pool = poolState.status === 'success' ? poolState.result.data : [];
    return [...pool].sort((a, b) => aptoRank(a) - aptoRank(b));
  }, [poolState]);
  const destaque = ranked[0] ?? null;
  const lista = ranked.slice(1, 4);

  // Certidões reais do cofre (alerta de vencimento).
  const { state: profileState } = useCompanyProfile();
  const certidoes =
    profileState.status === 'success' ? profileState.data.certidoes : [];
  const alertas = certidaoAlertas(certidoes);

  // Prontidão genérica real (T-45/T-46). As pendências alimentam o "Resolva X e
  // Y" do card — os requisitos que ainda não estão atendidos, na ordem da API.
  const { state: prontidaoState } = useProntidao();
  const prontidaoPct =
    prontidaoState.status === 'success' ? prontidaoState.data.percentual : null;
  const pendencias =
    prontidaoState.status === 'success'
      ? prontidaoState.data.itens
          .filter((i) => i.status !== 'atendido')
          .map((i) => i.label)
      : [];

  // Agenda real (T-91) — alimenta "Sua semana" e o bloco de atenção.
  const { state: agendaState } = useAgenda();
  const agendaEventos = agendaState.status === 'success' ? agendaState.data : [];
  // "Sua semana": qualquer prazo dos próximos 7 dias, do mais próximo ao mais
  // distante. Diferente de `prazosUrgentes`, que só olha entrega de proposta.
  const eventosSemana = [...agendaEventos]
    .filter((e) => {
      const d = daysUntil(e.data);
      return d >= 0 && d <= SEMANA_DIAS;
    })
    .sort((a, b) => daysUntil(a.data) - daysUntil(b.data))
    .slice(0, SEMANA_LIMITE);

  // Propostas em rascunho (T-60+) — entram em "Precisa da sua atenção".
  const { state: propostasState } = usePropostas();
  const rascunhos =
    propostasState.status === 'success'
      ? propostasState.data.filter((p) => p.status === 'rascunho')
      : [];

  // Prazos de entrega de proposta encerrando esta semana (T-91). Vencimento de
  // certidão fica de fora aqui — já tem bloco próprio (alertas) logo acima.
  const prazosUrgentes = agendaEventos.filter((e) => {
    if (e.tipo !== 'entrega_proposta') return false;
    const d = daysUntil(e.data);
    return d >= 0 && d <= PRAZO_ENTREGA_DIAS;
  });

  // "Precisa da sua atenção" (T-96): certidões vencidas/vencendo + prazos +
  // rascunhos, ORDENADOS por urgência real (dias até vencer, cruzando categorias)
  // — não mais por categoria fixa. Vencidos (dias negativos) no topo; rascunho
  // (sem data) no fim. É uma lista de AÇÃO, distinta da Central de Alertas (T-90).
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
        ordem: daysUntil(c.dataValidade), // negativo → topo
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
        ordem: d,
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
        ordem: daysUntil(p.data),
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
        ordem: Number.POSITIVE_INFINITY, // sem data → fim da lista
        to: `/orcamentos/${p.id}`,
      }),
    ),
  ];

  // T-96: ordena por urgência real (dias até vencer/entregar; vencidos negativos
  // no topo, rascunho no fim) cruzando categorias, e capa em ATENCAO_LIMITE. O
  // excedente vai pra Central de Alertas (o "lugar de tudo que pede olhar").
  const atencaoOrdenada = [...atencao].sort((a, b) => a.ordem - b.ordem);
  const atencaoVisivel = atencaoOrdenada.slice(0, ATENCAO_LIMITE);
  const atencaoExtra = atencaoOrdenada.length - atencaoVisivel.length;

  // Os chips ligados viram query params da busca (a lista lê tudo da URL).
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    const trimmed = query.trim();
    if (trimmed) params.set('q', trimmed);
    if (uf && chips.regiao) params.set('uf', uf);
    if (chips.valor) params.set('valorMax', String(VALOR_MAX_ME_EPP));
    if (chips.semana) params.set('dataInicio', semanaPassadaISO());
    if (chips.apto) params.set('apto', '1');
    const qs = params.toString();
    navigate(qs ? `/editais?${qs}` : '/editais');
  }

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
            {novasCount == null ? (
              'Carregando as obras da sua região…'
            ) : novasCount === 0 ? (
              <>
                Nenhuma obra nova desde ontem
                {regiaoCount != null && ` — ${regiaoCount} na sua região no total.`}
              </>
            ) : (
              <>
                <Text component="span" fw={700} c="orange.8">
                  {novasCount} {novasCount === 1 ? 'obra nova' : 'obras novas'}
                </Text>{' '}
                na sua região desde ontem
                {novasAptasCount ? ` — ${novasAptasCount} em que você está apto.` : '.'}
              </>
            )}
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
            <FilterChip
              label={`Minha região (${uf})`}
              active={chips.regiao}
              onToggle={() => toggleChip('regiao')}
            />
          )}
          <FilterChip
            label="Até R$ 80 mil (ME/EPP)"
            active={chips.valor}
            onToggle={() => toggleChip('valor')}
          />
          <FilterChip
            label="Publicados esta semana"
            active={chips.semana}
            onToggle={() => toggleChip('semana')}
          />
          <FilterChip
            label="Só onde estou apto"
            active={chips.apto}
            onToggle={() => toggleChip('apto')}
          />
        </Group>

        {/* card de destaque — melhor obra pra você hoje */}
        {destaque ? (
          <Card radius="lg" p="xl" mb="xl" bg="graphite.9" c="concreto.2">
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
              <Box style={{ flex: 1, minWidth: 240 }}>
                <Group gap="sm" mb={8}>
                  <Text
                    fz={11}
                    fw={500}
                    c="orange.6"
                    style={{
                      fontFamily: 'var(--mantine-font-family-monospace)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    Melhor obra pra você hoje
                  </Text>
                  <VereditoBadge veredito={destaque.veredito} />
                </Group>
                <Title order={2} fz={24} c="concreto.0" lineClamp={2} style={{ letterSpacing: '-0.01em' }}>
                  {encurtarObjeto(destaque.objeto)}
                </Title>
                <Text fz={13.5} c="concreto.5" mt={6}>
                  {destaque.orgaoNome} · {destaque.uf} · {destaque.modalidadeNome}
                </Text>
                <Group gap="sm" mt="md">
                  {destaque.valorEstimado != null && (
                    <Badge
                      variant="light"
                      color="gray"
                      radius="sm"
                      tt="none"
                      ff="monospace"
                      fw={500}
                    >
                      {brlCompact(destaque.valorEstimado)}
                    </Badge>
                  )}
                  <Badge color="gray" variant="light" radius="sm" tt="none">
                    {destaque.municipioNome}
                  </Badge>
                  {destaque.resumoPronto && (
                    <Badge
                      color="gray"
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

              <Stack gap="xs" className={classes.heroAside}>
                {temPrazoDestaque && (
                  <Box ta="right" mb={4}>
                    <Text
                      fz={11}
                      c="concreto.6"
                      tt="uppercase"
                      style={{
                        fontFamily: 'var(--mantine-font-family-monospace)',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Proposta encerra em
                    </Text>
                    <Text fz={32} fw={800} c="orange.5" lh={1.15} ff="monospace">
                      {diasDestaque === 0 ? 'hoje' : `${diasDestaque} dias`}
                    </Text>
                    <Text fz={12} c="concreto.6" ff="monospace">
                      {fmtDateTime(destaque.prazoProposta)}
                    </Text>
                  </Box>
                )}
                <Button component={Link} to={`/editais/${destaque.id}`} color="orange" fullWidth>
                  Montar proposta
                </Button>
                <Button
                  component={Link}
                  to={`/editais/${destaque.id}`}
                  variant="outline"
                  color="concreto.2"
                  fullWidth
                >
                  Ver resumo do edital
                </Button>
              </Stack>
            </Group>
          </Card>
        ) : poolState.status === 'error' ? (
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
              {poolState.message}
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
              {poolState.status === 'loading'
                ? 'Carregando editais da sua região…'
                : 'Busque licitações de obra pública na sua região pra começar.'}
            </Text>
            <Button component={Link} to="/editais" rightSection={<IconArrowRight size={16} />}>
              Buscar editais
            </Button>
          </Card>
        )}

        {/* prontidão + semana */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="xl">
          <ProntidaoCard
            percentual={prontidaoPct}
            pendencias={pendencias}
            regiaoCount={regiaoCount}
          />
          <SemanaCard
            eventos={eventosSemana}
            loading={agendaState.status === 'loading'}
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
                    {poolState.status === 'loading'
                      ? 'Carregando editais da sua região…'
                      : poolState.status === 'error'
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
            <Group justify="space-between" align="baseline" mb="sm">
              <Text fz={16} fw={700} ff="heading">
                Precisa da sua atenção
              </Text>
              {atencaoExtra > 0 && (
                <Anchor component={Link} to="/alertas" fz={12.5} fw={600} c="orange.8">
                  Ver tudo ({atencaoOrdenada.length})
                </Anchor>
              )}
            </Group>
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
                {atencaoVisivel.map((item) => {
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
                        {item.href ? (
                          <Anchor
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            fz={12.5}
                            fw={600}
                            c={item.color === 'alerta' ? 'alerta.7' : 'orange.8'}
                            style={{ flex: 'none', whiteSpace: 'nowrap' }}
                          >
                            {item.action}
                          </Anchor>
                        ) : (
                          <Anchor
                            component={Link}
                            to={item.to ?? '#'}
                            fz={12.5}
                            fw={600}
                            c={item.color === 'alerta' ? 'alerta.7' : 'orange.8'}
                            style={{ flex: 'none', whiteSpace: 'nowrap' }}
                          >
                            {item.action}
                          </Anchor>
                        )}
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
