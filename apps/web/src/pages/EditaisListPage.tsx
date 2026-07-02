import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Drawer,
  Group,
  MultiSelect,
  Pagination,
  RangeSlider,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import {
  IconArrowsSort,
  IconFilter,
  IconInfoCircle,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EditalCard } from '../components/EditalCard';
import { EmptyState, ErrorState, LoadingCards } from '../components/StateViews';
import { UFS } from '../data/ufs';
import { useEditaisSearch } from '../hooks/useEditaisSearch';
import { useMunicipios } from '../hooks/useMunicipios';
import { DEFAULT_PAGE_SIZE, ME_EPP_VALOR_LIMITE } from '../lib/constants';
import { brl, brlCompact, fmtDate } from '../lib/format';
import type { EditalSort, SearchEditaisParams } from '../types/edital';

interface Filters {
  uf: string;
  codigoIbge: string;
  // modalidade: ids do PNCP separados por vírgula na URL (ex.: "4,5"); o
  // buildQuery do client converte para o param repetido da API (T-80).
  modalidade: string;
  valorMin: string;
  valorMax: string;
  dataInicio: string;
  dataFim: string;
}

const EMPTY_FILTERS: Filters = {
  uf: '',
  codigoIbge: '',
  modalidade: '',
  valorMin: '',
  valorMax: '',
  dataInicio: '',
  dataFim: '',
};

// Hoje a captação só traz Concorrência (4/5) — o filtro é honesto e mostra só
// o que existe no banco. Expandir aqui se a captação passar a trazer mais (T-80).
const MODALIDADE_OPTIONS = [
  { value: '4', label: 'Concorrência eletrônica' },
  { value: '5', label: 'Concorrência presencial' },
];
const MODALIDADE_LABEL: Record<string, string> = Object.fromEntries(
  MODALIDADE_OPTIONS.map((o) => [o.value, o.label]),
);

// Ordenação (T-81). Espelha o `sort` da API; ausente = recentes.
const SORT_OPTIONS = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'prazo', label: 'Prazo mais próximo' },
  { value: 'valor', label: 'Maior valor' },
];
const SORT_VALUES = SORT_OPTIONS.map((o) => o.value);

// UF/município viajam na URL como csv ("SC,PR"); o client converte para os
// params repetidos da API (T-81).
const splitCsv = (s: string): string[] =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

// O seletor de município só faz sentido com UMA UF (a base geo é por UF).
const onlyUf = (csv: string): string => {
  const ufs = splitCsv(csv);
  return ufs.length === 1 ? ufs[0] : '';
};

const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof Filters)[];

function readFilters(sp: URLSearchParams): Filters {
  const out = { ...EMPTY_FILTERS };
  for (const key of FILTER_KEYS) out[key] = sp.get(key) ?? '';
  return out;
}

const UF_OPTIONS = UFS.map((uf) => ({
  value: uf.code,
  label: `${uf.code} — ${uf.name}`,
}));

// Teto do slider de valor (obra pública do alvo ME/EPP cabe bem abaixo disso);
// o thumb no máximo significa "sem teto" (não envia valorMax).
const VALOR_SLIDER_MAX = 3_000_000;

// Poll da captação sob demanda (T-34): intervalo entre recargas e número máximo
// de tentativas enquanto a UF ainda está sendo captada. ~4s × 10 = teto de ~40s,
// mas para assim que a captação termina (a lista atualiza sozinha nesse meio).
const CAPTURE_POLL_INTERVAL_MS = 4_000;
const CAPTURE_POLL_MAX = 10;

export function EditaisListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- estado aplicado (fonte da verdade = URL) ----
  const applied = useMemo(() => readFilters(searchParams), [searchParams]);
  const appliedKey = FILTER_KEYS.map((k) => applied[k]).join('|');
  const urlQuery = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  // Filtro "só obras em que estou apto" (T-53). Estado na URL (compartilhável).
  const apto = searchParams.get('apto') === '1';
  // Ordenação (T-81): param próprio na URL (toolbar sobre os resultados), muda
  // na hora (não passa pelo "Aplicar"). Inválido/ausente → recentes.
  const sortParam = searchParams.get('sort') ?? '';
  const sort = SORT_VALUES.includes(sortParam) ? (sortParam as EditalSort) : 'recentes';

  // ---- filtros em edição (pending) ----
  const [pending, setPending] = useState<Filters>(applied);
  // Ressincroniza o formulário quando os filtros aplicados mudam por fora
  // (chips, limpar, atalhos da home). Não cria laço: o "Aplicar" é a única via
  // que escreve pending → URL.
  useEffect(() => {
    setPending(readFilters(searchParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey]);

  // Municípios da UF (endpoint geo, cacheado por UF): o seletor usa a UF em
  // edição; o chip de filtro ativo usa a UF aplicada (resolve o nome do código).
  const pendingSingleUf = onlyUf(pending.uf);
  const { municipios: pendingMunicipios, loading: loadingMunicipios } =
    useMunicipios(pendingSingleUf);
  const { municipios: appliedMunicipios } = useMunicipios(onlyUf(applied.uf));
  const municipioNome = (codigoIbge: string): string =>
    appliedMunicipios.find((m) => m.codigoIbge === codigoIbge)?.nome ??
    codigoIbge;

  // ---- busca textual (local + debounce 400ms) ----
  const [queryInput, setQueryInput] = useState(urlQuery);
  const [debouncedQuery] = useDebouncedValue(queryInput, 400);
  const urlQueryRef = useRef(urlQuery);
  urlQueryRef.current = urlQuery;

  // Espelha a URL no input (atalho da home, remoção do chip de busca).
  useEffect(() => {
    setQueryInput(urlQuery);
  }, [urlQuery]);

  // Escreve a busca (já debounced) na URL e volta para a página 1. Depende só de
  // `debouncedQuery`; o guard evita reescrever quando já está igual à URL.
  useEffect(() => {
    if (debouncedQuery === urlQueryRef.current) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedQuery) next.set('q', debouncedQuery);
      else next.delete('q');
      next.delete('page');
      return next;
    });
  }, [debouncedQuery, setSearchParams]);

  // ---- parâmetros efetivos da busca ----
  const params = useMemo<SearchEditaisParams>(() => {
    const p: SearchEditaisParams = { page, pageSize: DEFAULT_PAGE_SIZE };
    const ufs = splitCsv(applied.uf);
    if (ufs.length) p.uf = ufs;
    const ibges = splitCsv(applied.codigoIbge);
    if (ibges.length) p.codigoIbge = ibges;
    const modalidades = applied.modalidade
      .split(',')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (modalidades.length) p.modalidade = modalidades;
    if (sort !== 'recentes') p.sort = sort;
    if (urlQuery) p.q = urlQuery;
    const min = Number(applied.valorMin);
    if (applied.valorMin && !Number.isNaN(min)) p.valorMin = min;
    const max = Number(applied.valorMax);
    if (applied.valorMax && !Number.isNaN(max)) p.valorMax = max;
    if (applied.dataInicio) p.dataInicio = applied.dataInicio;
    if (applied.dataFim) p.dataFim = applied.dataFim;
    return p;
  }, [applied, urlQuery, page, sort]);

  const { state, reload, isFetching } = useEditaisSearch(params, apto);

  // Painel de filtros vira Drawer no mobile (T-32).
  const [filtersOpened, { open: openFilters, close: closeFilters }] =
    useDisclosure(false);
  const activeFilterCount = FILTER_KEYS.filter((k) => applied[k]).length;

  // Dropdown dos MultiSelects controlado: por padrão o Mantine mantém aberto
  // após escolher (multi-seleção); aqui fechamos ao selecionar — abrir de novo
  // adiciona mais. Abre/fecha nas interações normais via os callbacks.
  const [ufDropdownOpened, setUfDropdownOpened] = useState(false);
  const [municipioDropdownOpened, setMunicipioDropdownOpened] = useState(false);

  // Captação sob demanda (T-34): a API sinaliza que está captando a UF. Só a 1ª
  // captação de uma UF AINDA VAZIA justifica o poll — aí a lista começa vazia e
  // precisa aparecer. Uma UF já populada mas com watermark velho também sinaliza
  // `capturing`, mas já mostra resultados na hora: não vale o poll (cada reload
  // piscaria os esqueletos) nem o alerta de "primeira vez".
  const capturingFirstTime =
    state.status === 'success' &&
    state.result.capturing === true &&
    state.result.total === 0;
  // Em vez de um reload cego de 25s, um poll curto: recarrega a cada
  // CAPTURE_POLL_INTERVAL_MS até CAPTURE_POLL_MAX tentativas. Como a captação
  // ingere linha a linha, os editais aparecem assim que existem; paramos quando
  // eles chegam (deixa de ser vazio) ou no teto (resta o "atualize agora").
  const pollCountRef = useRef(0);
  // Cada busca (UF/filtros/texto/aptidão/página) tem seu próprio ciclo de poll.
  useEffect(() => {
    pollCountRef.current = 0;
  }, [appliedKey, urlQuery, apto, page]);
  useEffect(() => {
    if (!capturingFirstTime || pollCountRef.current >= CAPTURE_POLL_MAX) return;
    const timer = setTimeout(() => {
      pollCountRef.current += 1;
      reload();
    }, CAPTURE_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [capturingFirstTime, reload]);

  // ---- ações ----
  function applyFilters() {
    const next = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      if (pending[key]) next.set(key, pending[key]);
    }
    if (urlQuery) next.set('q', urlQuery); // preserva a busca textual
    if (apto) next.set('apto', '1'); // preserva o toggle de aptidão
    if (sort !== 'recentes') next.set('sort', sort); // e a ordenação
    setSearchParams(next); // page volta a 1 (omitida)
    closeFilters();
  }

  function clearAll() {
    setPending(EMPTY_FILTERS);
    setQueryInput('');
    setSearchParams(new URLSearchParams());
    closeFilters();
  }

  function removeFilters(keys: (keyof Filters)[]) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of keys) next.delete(key);
      next.delete('page');
      return next;
    });
  }

  function removeQuery() {
    setQueryInput('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('q');
      next.delete('page');
      return next;
    });
  }

  function setPage(value: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value <= 1) next.delete('page');
      else next.set('page', String(value));
      return next;
    });
    // Trocar de página no rodapé deixava o usuário preso no fim da lista nova —
    // volta pro topo dos resultados.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleApto(value: boolean) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('apto', '1');
      else next.delete('apto');
      next.delete('page');
      return next;
    });
  }

  function setSort(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== 'recentes') next.set('sort', value);
      else next.delete('sort');
      next.delete('page');
      return next;
    });
  }

  // Remove uma UF do conjunto; município depende da UF, então é limpo junto.
  function removeUf(uf: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const rest = splitCsv(applied.uf).filter((u) => u !== uf);
      if (rest.length) next.set('uf', rest.join(','));
      else next.delete('uf');
      next.delete('codigoIbge');
      next.delete('page');
      return next;
    });
  }

  // Remove um município do conjunto.
  function removeIbge(ibge: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const rest = splitCsv(applied.codigoIbge).filter((c) => c !== ibge);
      if (rest.length) next.set('codigoIbge', rest.join(','));
      else next.delete('codigoIbge');
      next.delete('page');
      return next;
    });
  }

  // ---- chips de filtros ativos ----
  const chips: { label: string; onRemove: () => void }[] = [];
  for (const uf of splitCsv(applied.uf)) {
    chips.push({ label: `UF: ${uf}`, onRemove: () => removeUf(uf) });
  }
  for (const ibge of splitCsv(applied.codigoIbge)) {
    chips.push({
      label: `Município: ${municipioNome(ibge)}`,
      onRemove: () => removeIbge(ibge),
    });
  }
  if (applied.modalidade) {
    const labels = applied.modalidade
      .split(',')
      .map((v) => MODALIDADE_LABEL[v])
      .filter(Boolean);
    if (labels.length) {
      chips.push({
        label: `Modalidade: ${labels.join(', ')}`,
        onRemove: () => removeFilters(['modalidade']),
      });
    }
  }
  if (applied.valorMin) {
    chips.push({
      label: `Mín: ${brl(Number(applied.valorMin))}`,
      onRemove: () => removeFilters(['valorMin']),
    });
  }
  if (applied.valorMax) {
    chips.push({
      label: `Máx: ${brl(Number(applied.valorMax))}`,
      onRemove: () => removeFilters(['valorMax']),
    });
  }
  if (applied.dataInicio) {
    chips.push({
      label: `De ${fmtDate(applied.dataInicio)}`,
      onRemove: () => removeFilters(['dataInicio']),
    });
  }
  if (applied.dataFim) {
    chips.push({
      label: `Até ${fmtDate(applied.dataFim)}`,
      onRemove: () => removeFilters(['dataFim']),
    });
  }
  if (urlQuery) {
    chips.push({ label: `Busca: "${urlQuery}"`, onRemove: removeQuery });
  }

  const municipioOptions = pendingMunicipios.map((m) => ({
    value: m.codigoIbge,
    label: m.nome,
  }));

  const total = state.status === 'success' ? state.result.total : 0;
  const totalPages =
    state.status === 'success' ? Math.ceil(total / state.result.pageSize) : 0;

  // Formulário de filtros reutilizado no sidebar (desktop) e no Drawer (mobile).
  const filtersForm = (
    <Stack gap="md">
      <MultiSelect
        label="Estado (UF)"
        placeholder={pending.uf ? undefined : 'Todas as UFs'}
        data={UF_OPTIONS}
        value={splitCsv(pending.uf)}
        onChange={(values) => {
          // município depende de UMA UF — limpa ao mudar o conjunto de UFs.
          setPending((p) => ({ ...p, uf: values.join(','), codigoIbge: '' }));
          setUfDropdownOpened(false); // fecha ao selecionar
        }}
        dropdownOpened={ufDropdownOpened}
        onDropdownOpen={() => setUfDropdownOpened(true)}
        onDropdownClose={() => setUfDropdownOpened(false)}
        searchable
        clearable
        hidePickedOptions
      />

      <Box>
        <MultiSelect
          label="Município"
          placeholder={
            !pendingSingleUf
              ? splitCsv(pending.uf).length > 1
                ? 'Selecione uma única UF para filtrar por município'
                : 'Selecione a UF primeiro'
              : loadingMunicipios
                ? 'Carregando municípios…'
                : 'Todos os municípios'
          }
          data={municipioOptions}
          value={splitCsv(pending.codigoIbge)}
          onChange={(values) => {
            setPending((p) => ({ ...p, codigoIbge: values.join(',') }));
            setMunicipioDropdownOpened(false); // fecha ao selecionar
          }}
          dropdownOpened={municipioDropdownOpened}
          onDropdownOpen={() => setMunicipioDropdownOpened(true)}
          onDropdownClose={() => setMunicipioDropdownOpened(false)}
          disabled={!pendingSingleUf || loadingMunicipios}
          nothingFoundMessage={
            loadingMunicipios ? 'Carregando…' : 'Nenhum município encontrado'
          }
          searchable
          clearable
          hidePickedOptions
        />
        <Text fz={11} c="gray.5" mt={5}>
          Disponível ao escolher uma única UF. Resolve para o código IBGE.
        </Text>
      </Box>

      <Box>
        <Text fz={13} fw={500} c="gray.7" mb={6}>
          Modalidade
        </Text>
        <Checkbox.Group
          value={pending.modalidade ? pending.modalidade.split(',') : []}
          onChange={(vals) =>
            setPending((p) => ({
              ...p,
              modalidade: [...vals].sort().join(','),
            }))
          }
        >
          <Stack gap={8}>
            {MODALIDADE_OPTIONS.map((o) => (
              <Checkbox key={o.value} value={o.value} label={o.label} size="sm" />
            ))}
          </Stack>
        </Checkbox.Group>
      </Box>

      <Box>
        <Text fz={13} fw={500} c="gray.7" mb={6}>
          Valor da obra
        </Text>
        <RangeSlider
          min={0}
          max={VALOR_SLIDER_MAX}
          step={50_000}
          value={[
            pending.valorMin ? Number(pending.valorMin) : 0,
            pending.valorMax
              ? Math.min(Number(pending.valorMax), VALOR_SLIDER_MAX)
              : VALOR_SLIDER_MAX,
          ]}
          onChange={([lo, hi]) =>
            setPending((p) => ({
              ...p,
              valorMin: lo > 0 ? String(lo) : '',
              valorMax: hi < VALOR_SLIDER_MAX ? String(hi) : '',
            }))
          }
          color="orange"
          label={(v) => (v >= VALOR_SLIDER_MAX ? 'sem teto' : brlCompact(v))}
          mt="xs"
          mb={6}
        />
        <Group justify="space-between" mb="xs">
          <Text fz={11.5} c="dimmed">
            {pending.valorMin ? brlCompact(Number(pending.valorMin)) : 'R$ 0'}
          </Text>
          <Text fz={11.5} c="dimmed">
            {pending.valorMax ? brlCompact(Number(pending.valorMax)) : 'sem teto'}
          </Text>
        </Group>
        <Badge
          variant="light"
          color="orange"
          radius="xl"
          tt="none"
          style={{ cursor: 'pointer' }}
          onClick={() =>
            setPending((p) => ({
              ...p,
              valorMin: '',
              valorMax: String(ME_EPP_VALOR_LIMITE),
            }))
          }
        >
          Até R$ 80 mil (ME/EPP)
        </Badge>
      </Box>

      <Box>
        <Text fz={13} fw={500} c="gray.7" mb={6}>
          Período de publicação
        </Text>
        <Stack gap="xs">
          <TextInput
            type="date"
            leftSection={
              <Text fz={12} c="dimmed">
                De
              </Text>
            }
            leftSectionWidth={36}
            value={pending.dataInicio}
            onChange={(e) =>
              setPending((p) => ({ ...p, dataInicio: e.currentTarget.value }))
            }
          />
          <TextInput
            type="date"
            leftSection={
              <Text fz={12} c="dimmed">
                Até
              </Text>
            }
            leftSectionWidth={36}
            value={pending.dataFim}
            onChange={(e) =>
              setPending((p) => ({ ...p, dataFim: e.currentTarget.value }))
            }
          />
        </Stack>
      </Box>

      <Box>
        <Text fz={13} fw={500} c="gray.7" mb={6}>
          Aptidão
        </Text>
        <Switch
          checked={apto}
          onChange={(e) => toggleApto(e.currentTarget.checked)}
          label="Só onde estou apto"
          color="apto"
          size="sm"
        />
      </Box>

      <Group gap="xs" grow>
        <Button onClick={applyFilters}>Aplicar</Button>
        <Button variant="default" onClick={clearAll}>
          Limpar
        </Button>
      </Group>
    </Stack>
  );

  return (
    <Box style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
      {/* ---- painel de filtros: sidebar no desktop ---- */}
      <Box
        component="aside"
        w={300}
        p="lg"
        visibleFrom="md"
        style={{
          flex: 'none',
          alignSelf: 'stretch',
          background: 'var(--mantine-color-white)',
          borderRight: '1px solid var(--mantine-color-gray-3)',
          position: 'sticky',
          top: 60,
        }}
      >
        <Text
          fz={12}
          fw={800}
          c="gray.7"
          tt="uppercase"
          mb="md"
          style={{ letterSpacing: 0.6 }}
        >
          Filtros
        </Text>
        {filtersForm}
      </Box>

      {/* ---- painel de filtros: Drawer no mobile ---- */}
      <Drawer
        opened={filtersOpened}
        onClose={closeFilters}
        title="Filtros"
        padding="lg"
        size="xs"
      >
        {filtersForm}
      </Drawer>

      {/* ---- resultados ---- */}
      <Box
        component="main"
        style={{ flex: 1, minWidth: 0 }}
        px={{ base: 'md', sm: 'lg' }}
        py="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              const q = queryInput.trim();
              if (q) next.set('q', q);
              else next.delete('q');
              next.delete('page');
              return next;
            });
          }}
        >
          <Group gap="sm" maw={760} mb="md" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              size="md"
              radius="md"
              leftSection={<IconSearch size={17} />}
              placeholder="Buscar no objeto: pavimentação, escola, ponte…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.currentTarget.value)}
            />
            <Button type="submit" size="md" color="orange" style={{ flex: 'none' }}>
              Buscar
            </Button>
          </Group>
        </form>

        <Group justify="space-between" mb="sm" gap="sm" wrap="wrap">
          <Text fz={14} fw={600} c="gray.7" role="status" aria-live="polite">
            {state.status === 'success'
              ? apto
                ? `${total} ${total === 1 ? 'obra em que você está apto' : 'obras em que você está apto'}`
                : `${total} ${total === 1 ? 'edital encontrado' : 'editais encontrados'}`
              : 'Buscando editais…'}
          </Text>
          <Group gap="sm">
            <Button
              hiddenFrom="md"
              variant="default"
              size="xs"
              leftSection={<IconFilter size={15} />}
              onClick={openFilters}
            >
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            <Select
              aria-label="Ordenar"
              data={SORT_OPTIONS}
              value={sort}
              onChange={(value) => setSort(value ?? 'recentes')}
              size="xs"
              w={186}
              allowDeselect={false}
              checkIconPosition="right"
              leftSection={<IconArrowsSort size={14} />}
              comboboxProps={{ withinPortal: true }}
            />
          </Group>
        </Group>

        {chips.length > 0 && (
          <Group gap={7} mb="md">
            {chips.map((chip) => (
              <Badge
                key={chip.label}
                variant="default"
                radius="xl"
                tt="none"
                size="lg"
                rightSection={
                  <ActionIcon
                    size={16}
                    radius="xl"
                    variant="subtle"
                    color="gray"
                    onClick={chip.onRemove}
                    aria-label={`Remover ${chip.label}`}
                  >
                    <IconX size={11} />
                  </ActionIcon>
                }
                styles={{ label: { fontWeight: 500 } }}
              >
                {chip.label}
              </Badge>
            ))}
          </Group>
        )}

        {capturingFirstTime && (
          <Alert
            color="orange"
            variant="light"
            icon={<IconInfoCircle size={18} />}
            title={`Buscando editais${applied.uf ? ` de ${applied.uf}` : ''} pela primeira vez`}
            mb="md"
          >
            Esta região ainda não havia sido consultada — estamos buscando os
            editais agora. A lista atualiza sozinha em instantes; se preferir,{' '}
            <Anchor component="button" type="button" onClick={reload} inherit>
              atualize agora
            </Anchor>
            .
          </Alert>
        )}

        {state.status === 'loading' && (
          <LoadingCards count={DEFAULT_PAGE_SIZE} />
        )}

        {state.status === 'error' && (
          <ErrorState
            title="Não foi possível carregar os editais."
            description={state.message}
            onRetry={reload}
          />
        )}

        {state.status === 'success' && total === 0 && apto && (
          <EmptyState
            title="Nenhuma obra apta encontrada (entre as já analisadas)."
            description="O filtro só considera editais já analisados pela IA. Abra editais para que sejam analisados, ou complete seu perfil no cofre para atender mais requisitos."
            actionLabel="Mostrar todos os editais"
            onAction={() => toggleApto(false)}
          />
        )}

        {state.status === 'success' && total === 0 && !apto && (
          <EmptyState
            title="Nenhum edital encontrado com esses filtros."
            description="Tente ampliar a busca: remova filtros de valor, período ou município, ou use um termo mais geral."
            actionLabel="Limpar filtros"
            onAction={clearAll}
          />
        )}

        {state.status === 'success' && total > 0 && (
          <Stack gap="sm">
            {/* Esmaece (não apaga) os resultados durante a revalidação — SWR. */}
            <Box
              style={{
                opacity: isFetching ? 0.55 : 1,
                transition: 'opacity 120ms ease',
              }}
            >
              <Stack gap="sm">
                {state.result.data.map((edital) => (
                  <EditalCard
                    key={edital.id}
                    edital={edital}
                    veredito={edital.veredito}
                  />
                ))}
              </Stack>
            </Box>
            {totalPages > 1 && (
              <Group justify="center" mt="md">
                <Pagination
                  total={totalPages}
                  value={page}
                  onChange={setPage}
                  color="orange"
                />
              </Group>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
