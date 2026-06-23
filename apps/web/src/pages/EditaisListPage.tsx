import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconInfoCircle, IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EditalCard } from '../components/EditalCard';
import { EmptyState, ErrorState, LoadingCards } from '../components/StateViews';
import { municipioNome, MUNICIPIOS_POR_UF } from '../data/cidades';
import { UFS } from '../data/ufs';
import { useEditaisSearch } from '../hooks/useEditaisSearch';
import { DEFAULT_PAGE_SIZE, ME_EPP_VALOR_LIMITE } from '../lib/constants';
import { brl, fmtDate } from '../lib/format';
import type { SearchEditaisParams } from '../types/edital';

interface Filters {
  uf: string;
  codigoIbge: string;
  valorMin: string;
  valorMax: string;
  dataInicio: string;
  dataFim: string;
}

const EMPTY_FILTERS: Filters = {
  uf: '',
  codigoIbge: '',
  valorMin: '',
  valorMax: '',
  dataInicio: '',
  dataFim: '',
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

export function EditaisListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- estado aplicado (fonte da verdade = URL) ----
  const applied = useMemo(() => readFilters(searchParams), [searchParams]);
  const appliedKey = FILTER_KEYS.map((k) => applied[k]).join('|');
  const urlQuery = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  // ---- filtros em edição (pending) ----
  const [pending, setPending] = useState<Filters>(applied);
  // Ressincroniza o formulário quando os filtros aplicados mudam por fora
  // (chips, limpar, atalhos da home). Não cria laço: o "Aplicar" é a única via
  // que escreve pending → URL.
  useEffect(() => {
    setPending(readFilters(searchParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey]);

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
    if (applied.uf) p.uf = applied.uf;
    if (applied.codigoIbge) p.codigoIbge = applied.codigoIbge;
    if (urlQuery) p.q = urlQuery;
    const min = Number(applied.valorMin);
    if (applied.valorMin && !Number.isNaN(min)) p.valorMin = min;
    const max = Number(applied.valorMax);
    if (applied.valorMax && !Number.isNaN(max)) p.valorMax = max;
    if (applied.dataInicio) p.dataInicio = applied.dataInicio;
    if (applied.dataFim) p.dataFim = applied.dataFim;
    return p;
  }, [applied, urlQuery, page]);

  const { state, reload } = useEditaisSearch(params);

  // Captação sob demanda (T-34): a API sinaliza que está buscando a UF pela
  // primeira vez. Recarrega uma vez (~25s) para pegar os editais recém-captados.
  const capturing = state.status === 'success' && state.result.capturing === true;
  const autoReloadedRef = useRef(false);
  useEffect(() => {
    autoReloadedRef.current = false;
  }, [appliedKey, urlQuery]);
  useEffect(() => {
    if (!capturing || autoReloadedRef.current) return;
    autoReloadedRef.current = true;
    const timer = setTimeout(() => reload(), 25_000);
    return () => clearTimeout(timer);
  }, [capturing, reload]);

  // ---- ações ----
  function applyFilters() {
    const next = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      if (pending[key]) next.set(key, pending[key]);
    }
    if (urlQuery) next.set('q', urlQuery); // preserva a busca textual
    setSearchParams(next); // page volta a 1 (omitida)
  }

  function clearAll() {
    setPending(EMPTY_FILTERS);
    setQueryInput('');
    setSearchParams(new URLSearchParams());
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
  }

  // ---- chips de filtros ativos ----
  const chips: { label: string; onRemove: () => void }[] = [];
  if (applied.uf) {
    chips.push({
      label: `UF: ${applied.uf}`,
      onRemove: () => removeFilters(['uf', 'codigoIbge']),
    });
  }
  if (applied.codigoIbge) {
    chips.push({
      label: `Município: ${municipioNome(applied.codigoIbge)}`,
      onRemove: () => removeFilters(['codigoIbge']),
    });
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

  const municipioOptions = (MUNICIPIOS_POR_UF[pending.uf] ?? []).map((m) => ({
    value: m.codigoIbge,
    label: m.nome,
  }));

  const total = state.status === 'success' ? state.result.total : 0;
  const totalPages =
    state.status === 'success' ? Math.ceil(total / state.result.pageSize) : 0;

  return (
    <Box style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
      {/* ---- painel de filtros ---- */}
      <Box
        component="aside"
        w={300}
        p="lg"
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

        <Stack gap="md">
          <Select
            label="Estado (UF)"
            placeholder="Todas as UFs"
            data={UF_OPTIONS}
            value={pending.uf || null}
            onChange={(value) =>
              setPending((p) => ({ ...p, uf: value ?? '', codigoIbge: '' }))
            }
            searchable
            clearable
          />

          <Box>
            <Select
              label="Município"
              placeholder={pending.uf ? 'Todos os municípios' : 'Selecione a UF primeiro'}
              data={municipioOptions}
              value={pending.codigoIbge || null}
              onChange={(value) =>
                setPending((p) => ({ ...p, codigoIbge: value ?? '' }))
              }
              disabled={!pending.uf}
              searchable
              clearable
            />
            <Text fz={11} c="gray.5" mt={5}>
              Resolve para o código IBGE (7 dígitos).
            </Text>
          </Box>

          <Box>
            <Text fz={13} fw={500} c="gray.7" mb={6}>
              Faixa de valor estimado (R$)
            </Text>
            <Group gap="xs" grow>
              <NumberInput
                placeholder="Mín."
                value={pending.valorMin === '' ? '' : Number(pending.valorMin)}
                onChange={(value) =>
                  setPending((p) => ({
                    ...p,
                    valorMin: value === '' ? '' : String(value),
                  }))
                }
                min={0}
                allowNegative={false}
                thousandSeparator="."
                decimalSeparator=","
                hideControls
              />
              <NumberInput
                placeholder="Máx."
                value={pending.valorMax === '' ? '' : Number(pending.valorMax)}
                onChange={(value) =>
                  setPending((p) => ({
                    ...p,
                    valorMax: value === '' ? '' : String(value),
                  }))
                }
                min={0}
                allowNegative={false}
                thousandSeparator="."
                decimalSeparator=","
                hideControls
              />
            </Group>
            <Badge
              variant="light"
              color="orange"
              radius="xl"
              tt="none"
              mt="xs"
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
                leftSection={<Text fz={12} c="dimmed">De</Text>}
                leftSectionWidth={36}
                value={pending.dataInicio}
                onChange={(e) =>
                  setPending((p) => ({ ...p, dataInicio: e.currentTarget.value }))
                }
              />
              <TextInput
                type="date"
                leftSection={<Text fz={12} c="dimmed">Até</Text>}
                leftSectionWidth={36}
                value={pending.dataFim}
                onChange={(e) =>
                  setPending((p) => ({ ...p, dataFim: e.currentTarget.value }))
                }
              />
            </Stack>
          </Box>

          <Group gap="xs" grow>
            <Button onClick={applyFilters}>Aplicar</Button>
            <Button variant="default" onClick={clearAll}>
              Limpar
            </Button>
          </Group>
        </Stack>
      </Box>

      {/* ---- resultados ---- */}
      <Box component="main" style={{ flex: 1, minWidth: 0 }} p="lg">
        <Box maw={760} mb="md">
          <TextInput
            size="md"
            radius="md"
            leftSection={<IconSearch size={17} />}
            placeholder="Buscar no objeto: pavimentação, escola, ponte…"
            value={queryInput}
            onChange={(e) => setQueryInput(e.currentTarget.value)}
          />
        </Box>

        <Group justify="space-between" mb="sm" gap="md">
          <Text fz={14} fw={600} c="gray.7">
            {state.status === 'success'
              ? `${total} ${total === 1 ? 'edital encontrado' : 'editais encontrados'}`
              : 'Buscando editais…'}
          </Text>
          <Text fz={12.5} c="dimmed">
            Ordenado por: mais recentes primeiro
          </Text>
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

        {capturing && (
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

        {state.status === 'loading' && <LoadingCards count={5} />}

        {state.status === 'error' && (
          <ErrorState
            title="Não foi possível carregar os editais."
            description={state.message}
            onRetry={reload}
          />
        )}

        {state.status === 'success' && total === 0 && (
          <EmptyState
            title="Nenhum edital encontrado com esses filtros."
            description="Tente ampliar a busca: remova filtros de valor, período ou município, ou use um termo mais geral."
            actionLabel="Limpar filtros"
            onAction={clearAll}
          />
        )}

        {state.status === 'success' && total > 0 && (
          <Stack gap="sm">
            {state.result.data.map((edital) => (
              <EditalCard key={edital.id} edital={edital} />
            ))}
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
