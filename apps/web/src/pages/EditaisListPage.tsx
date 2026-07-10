import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Card,
  Checkbox,
  Drawer,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Pagination,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { IconFilter, IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EditalCard } from '../components/EditalCard';
import { EmptyState, ErrorState, LoadingCards } from '../components/StateViews';
import { UFS } from '../data/ufs';
import { useEditaisSearch } from '../hooks/useEditaisSearch';
import { useMunicipios } from '../hooks/useMunicipios';
import { DEFAULT_PAGE_SIZE, ME_EPP_VALOR_LIMITE } from '../lib/constants';
import classes from '../styles/cards.module.css';
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

// Ordenação (T-81). Espelha o `sort` da API; ausente = recentes.
const SORT_OPTIONS = [
  { value: 'recentes', label: 'Recentes' },
  { value: 'prazo', label: 'Prazo' },
  { value: 'valor', label: 'Valor' },
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

// Poll da captação sob demanda (T-34): intervalo entre recargas e número máximo
// de tentativas enquanto a UF ainda está sendo captada. ~4s × 10 = teto de ~40s,
// mas para assim que a captação termina (a lista atualiza sozinha nesse meio).
const CAPTURE_POLL_INTERVAL_MS = 4_000;
const CAPTURE_POLL_MAX = 10;

/** Rótulo mono maiúsculo das seções de filtro (identidade da marca). */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="brand-label" mb={8}>
      {children}
    </Text>
  );
}

export function EditaisListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- estado aplicado (fonte da verdade = URL) ----
  const applied = useMemo(() => readFilters(searchParams), [searchParams]);
  const appliedKey = FILTER_KEYS.map((k) => applied[k]).join('|');
  const urlQuery = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  // Filtro "só obras em que estou apto" (T-53). Estado na URL (compartilhável).
  const apto = searchParams.get('apto') === '1';
  // Ordenação (T-81): param próprio na URL (pílulas sobre os resultados), muda
  // na hora (não passa pelo "Aplicar"). Inválido/ausente → recentes.
  const sortParam = searchParams.get('sort') ?? '';
  const sort = SORT_VALUES.includes(sortParam) ? (sortParam as EditalSort) : 'recentes';

  // ---- filtros em edição (pending) ----
  const [pending, setPending] = useState<Filters>(applied);
  // Ressincroniza o formulário quando os filtros aplicados mudam por fora
  // (limpar, atalhos da home). Não cria laço: o "Aplicar" é a única via que
  // escreve pending → URL.
  useEffect(() => {
    setPending(readFilters(searchParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey]);

  // Municípios da UF (endpoint geo, cacheado por UF), a partir da UF em edição.
  const pendingSingleUf = onlyUf(pending.uf);
  const { municipios: pendingMunicipios, loading: loadingMunicipios } =
    useMunicipios(pendingSingleUf);

  // ---- busca textual (local + debounce 400ms) ----
  const [queryInput, setQueryInput] = useState(urlQuery);
  const [debouncedQuery] = useDebouncedValue(queryInput, 400);
  const urlQueryRef = useRef(urlQuery);
  urlQueryRef.current = urlQuery;

  // Espelha a URL no input (atalho da home, limpar a busca).
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

  // Dropdowns controlados: o Mantine mantém o multi-select aberto após escolher;
  // aqui fechamos ao selecionar — abrir de novo adiciona mais.
  const [ufPopoverOpened, setUfPopoverOpened] = useState(false);
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

  // ---- UF como chips (estado em edição; vale ao "Aplicar filtros") ----
  const pendingUfs = splitCsv(pending.uf);

  function addPendingUf(uf: string) {
    // Município resolve por UF: trocar o conjunto de UFs invalida a escolha.
    setPending((p) => ({
      ...p,
      uf: [...splitCsv(p.uf), uf].join(','),
      codigoIbge: '',
    }));
    setUfPopoverOpened(false);
  }

  function removePendingUf(uf: string) {
    setPending((p) => ({
      ...p,
      uf: splitCsv(p.uf)
        .filter((u) => u !== uf)
        .join(','),
      codigoIbge: '',
    }));
  }

  const ufDisponiveis = UF_OPTIONS.filter((o) => !pendingUfs.includes(o.value));

  const municipioOptions = pendingMunicipios.map((m) => ({
    value: m.codigoIbge,
    label: m.nome,
  }));

  const total = state.status === 'success' ? state.result.total : 0;
  const totalPages =
    state.status === 'success' ? Math.ceil(total / state.result.pageSize) : 0;

  // Linha de contagem: "128 obras encontradas para “pavimentação” em SC".
  const ufsAplicadas = splitCsv(applied.uf);
  const contagemSufixo = [
    urlQuery ? `para “${urlQuery}”` : null,
    ufsAplicadas.length ? `em ${ufsAplicadas.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  // Formulário de filtros reutilizado no sidebar (desktop) e no Drawer (mobile).
  const filtersForm = (
    <Stack gap="lg">
      <Box>
        <SectionLabel>UF</SectionLabel>
        <Group gap={7}>
          {pendingUfs.map((uf) => (
            <UnstyledButton
              key={uf}
              className={classes.filterChip}
              data-active
              onClick={() => removePendingUf(uf)}
              aria-label={`Remover UF ${uf}`}
            >
              {uf}
              <IconX size={13} stroke={2.4} />
            </UnstyledButton>
          ))}
          <Popover
            opened={ufPopoverOpened}
            onChange={setUfPopoverOpened}
            position="bottom-start"
            withinPortal
            shadow="md"
          >
            <Popover.Target>
              <UnstyledButton
                className={classes.filterChip}
                onClick={() => setUfPopoverOpened((o) => !o)}
              >
                <Text component="span" fz={13} fw={500} c="dimmed">
                  +
                </Text>
                UF
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown p="xs">
              <Select
                data={ufDisponiveis}
                value={null}
                onChange={(value) => value && addPendingUf(value)}
                placeholder="Buscar UF"
                searchable
                nothingFoundMessage="Nenhuma UF"
                comboboxProps={{ withinPortal: false }}
                w={200}
              />
            </Popover.Dropdown>
          </Popover>
        </Group>
      </Box>

      <Box>
        <SectionLabel>Município</SectionLabel>
        <MultiSelect
          placeholder={
            !pendingSingleUf
              ? pendingUfs.length > 1
                ? 'Escolha uma única UF'
                : 'Escolha a UF primeiro'
              : loadingMunicipios
                ? 'Carregando municípios…'
                : `Todos de ${pendingSingleUf}`
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
      </Box>

      <Box>
        <SectionLabel>Modalidade</SectionLabel>
        <Checkbox.Group
          value={pending.modalidade ? pending.modalidade.split(',') : []}
          onChange={(vals) =>
            setPending((p) => ({
              ...p,
              modalidade: [...vals].sort().join(','),
            }))
          }
        >
          <Stack gap={10}>
            {MODALIDADE_OPTIONS.map((o) => (
              <Checkbox key={o.value} value={o.value} label={o.label} size="sm" />
            ))}
          </Stack>
        </Checkbox.Group>
      </Box>

      <Box>
        <SectionLabel>Valor estimado</SectionLabel>
        <Group gap="xs" grow wrap="nowrap">
          <NumberInput
            aria-label="Valor mínimo"
            placeholder="R$ mín"
            prefix="R$ "
            thousandSeparator="."
            decimalSeparator=","
            hideControls
            min={0}
            value={pending.valorMin ? Number(pending.valorMin) : ''}
            onChange={(v) =>
              setPending((p) => ({ ...p, valorMin: v === '' ? '' : String(v) }))
            }
          />
          <NumberInput
            aria-label="Valor máximo"
            placeholder="R$ máx"
            prefix="R$ "
            thousandSeparator="."
            decimalSeparator=","
            hideControls
            min={0}
            value={pending.valorMax ? Number(pending.valorMax) : ''}
            onChange={(v) =>
              setPending((p) => ({ ...p, valorMax: v === '' ? '' : String(v) }))
            }
          />
        </Group>
        <Button
          variant="light"
          color="orange"
          radius="xl"
          size="sm"
          fullWidth
          mt="sm"
          onClick={() =>
            setPending((p) => ({
              ...p,
              valorMin: '',
              valorMax: String(ME_EPP_VALOR_LIMITE),
            }))
          }
        >
          Até R$ 80 mil (ME/EPP)
        </Button>
      </Box>

      <Box>
        <SectionLabel>Publicação</SectionLabel>
        <Group gap="xs" grow wrap="nowrap">
          <TextInput
            type="date"
            aria-label="Publicado a partir de"
            value={pending.dataInicio}
            onChange={(e) =>
              setPending((p) => ({ ...p, dataInicio: e.currentTarget.value }))
            }
          />
          <TextInput
            type="date"
            aria-label="Publicado até"
            value={pending.dataFim}
            onChange={(e) =>
              setPending((p) => ({ ...p, dataFim: e.currentTarget.value }))
            }
          />
        </Group>
      </Box>

      {/* Aptidão aplica na hora (mexe na URL), diferente do resto do formulário
          — é um recorte da lista, não um filtro de campo. */}
      <Box
        p="sm"
        style={{
          background: 'var(--mantine-color-apto-0)',
          border: '1px solid var(--mantine-color-apto-2)',
          borderRadius: 'var(--mantine-radius-md)',
        }}
      >
        <Checkbox
          checked={apto}
          onChange={(e) => toggleApto(e.currentTarget.checked)}
          label="Só obras em que estou apto"
          color="apto"
          size="sm"
          styles={{ label: { fontWeight: 600, fontSize: 13.5 } }}
        />
      </Box>

      <Button onClick={applyFilters} size="md" fullWidth>
        Aplicar filtros
      </Button>
    </Stack>
  );

  return (
    <Box style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }} py="lg">
      {/* ---- painel de filtros: card no desktop ---- */}
      <Box
        component="aside"
        w={332}
        px="lg"
        visibleFrom="md"
        style={{ flex: 'none', position: 'sticky', top: 60 }}
      >
        <Card withBorder radius="lg" p="lg">
          <Group justify="space-between" align="center" mb="lg">
            <Text fz={15} fw={700} ff="heading">
              Filtros
            </Text>
            <Anchor
              component="button"
              type="button"
              onClick={clearAll}
              fz={13}
              fw={600}
              c="dimmed"
            >
              Limpar
            </Anchor>
          </Group>
          {filtersForm}
        </Card>
      </Box>

      {/* ---- painel de filtros: Drawer no mobile ---- */}
      <Drawer
        opened={filtersOpened}
        onClose={closeFilters}
        title={
          <Group gap="md">
            <Text fz={15} fw={700} ff="heading">
              Filtros
            </Text>
            <Anchor
              component="button"
              type="button"
              onClick={clearAll}
              fz={13}
              fw={600}
              c="dimmed"
            >
              Limpar
            </Anchor>
          </Group>
        }
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
          <TextInput
            size="md"
            radius="md"
            mb="md"
            leftSection={<IconSearch size={17} />}
            placeholder="Buscar no objeto: pavimentação, escola, ponte…"
            value={queryInput}
            onChange={(e) => setQueryInput(e.currentTarget.value)}
            rightSection={
              queryInput ? (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  radius="xl"
                  size="sm"
                  onClick={removeQuery}
                  aria-label="Limpar busca"
                >
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
          />
        </form>

        {capturingFirstTime && (
          <Group
            gap="sm"
            wrap="nowrap"
            mb="md"
            p="md"
            style={{
              background: 'var(--mantine-color-orange-0)',
              border: '1px solid var(--mantine-color-orange-2)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <Loader size={17} color="orange.8" style={{ flex: 'none' }} />
            <Text fz={13.5} c="graphite.7">
              <Text component="span" inherit fw={700} c="graphite.9">
                Captando editais novos
                {applied.uf ? ` de ${applied.uf}` : ''} agora.
              </Text>{' '}
              Resultados frescos aparecem na próxima busca, em ~1 minuto. Se
              preferir,{' '}
              <Anchor component="button" type="button" onClick={reload} inherit>
                atualize agora
              </Anchor>
              .
            </Text>
          </Group>
        )}

        <Group justify="space-between" mb="md" gap="sm" wrap="wrap">
          <Text fz={14} c="dimmed" role="status" aria-live="polite">
            {state.status !== 'success' ? (
              'Buscando editais…'
            ) : (
              <>
                <Text component="span" inherit fw={700} c="graphite.9">
                  {total} {total === 1 ? 'obra' : 'obras'}
                </Text>{' '}
                {apto
                  ? 'em que você está apto'
                  : total === 1
                    ? 'encontrada'
                    : 'encontradas'}
                {contagemSufixo && ` ${contagemSufixo}`}
              </>
            )}
          </Text>
          <Group gap="xs">
            <Button
              hiddenFrom="md"
              variant="default"
              size="xs"
              leftSection={<IconFilter size={15} />}
              onClick={openFilters}
            >
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            <Text fz={13} c="dimmed" visibleFrom="sm">
              Ordenar:
            </Text>
            {SORT_OPTIONS.map((o) => (
              <UnstyledButton
                key={o.value}
                className={classes.filterChip}
                data-active={sort === o.value || undefined}
                onClick={() => setSort(o.value)}
                aria-pressed={sort === o.value}
              >
                {o.label}
              </UnstyledButton>
            ))}
          </Group>
        </Group>

        {state.status === 'loading' && <LoadingCards count={DEFAULT_PAGE_SIZE} />}

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
              <Group justify="center" mt="lg">
                <Pagination
                  total={totalPages}
                  value={page}
                  onChange={setPage}
                  color="graphite.9"
                  radius="md"
                />
              </Group>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
