import {
  Anchor,
  Box,
  Card,
  Group,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  type Icon,
  IconBuildingEstate,
  IconChartBar,
  IconClock,
  IconFileText,
  IconSparkles,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingCards } from '../components/StateViews';
import { useAlertas } from '../context/alertas-context';
import { fmtDate } from '../lib/format';
import type { AlertaCat, AlertaItem } from '../types/alerta';

// Ícone + cor por categoria (T-90), nos tokens da marca.
const CAT_META: Record<AlertaCat, { icon: Icon; color: string }> = {
  obra: { icon: IconBuildingEstate, color: 'orange' },
  prazo: { icon: IconClock, color: 'alerta' },
  documento: { icon: IconFileText, color: 'orange' },
  ia: { icon: IconSparkles, color: 'apto' },
  orcamento: { icon: IconChartBar, color: 'apto' },
};

const TAB_TO_CAT: Record<string, AlertaCat | null> = {
  todos: null,
  prazos: 'prazo',
  documentos: 'documento',
  ia: 'ia',
  resultados: 'orcamento',
};

function AlertaRow({ alerta }: { alerta: AlertaItem }) {
  const meta = CAT_META[alerta.cat];
  const ItemIcon = meta.icon;
  // href externo (T-111): certidão com portal de emissão vai direto pra lá, em
  // nova aba; href interno segue como rota do app.
  const externo = /^https?:\/\//.test(alerta.href);
  const linkProps = externo
    ? { component: 'a' as const, href: alerta.href, target: '_blank', rel: 'noopener noreferrer' }
    : { component: Link, to: alerta.href };
  return (
    <Card
      {...linkProps}
      withBorder
      radius="md"
      p="md"
      td="none"
      c="inherit"
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Box
          w={7}
          h={7}
          mt={6}
          style={{
            flex: 'none',
            borderRadius: '50%',
            backgroundColor: alerta.novo
              ? 'var(--mantine-color-orange-6)'
              : 'transparent',
          }}
        />
        <ThemeIcon color={meta.color} variant="light" radius="md" size={36} style={{ flex: 'none' }}>
          <ItemIcon size={18} />
        </ThemeIcon>
        <Box style={{ minWidth: 0 }}>
          <Text fz={14} fw={600} style={{ lineHeight: 1.4 }}>
            {alerta.titulo}
          </Text>
          <Text fz={13} c="dimmed" lineClamp={2} style={{ lineHeight: 1.35 }}>
            {alerta.detalhe}
          </Text>
          <Text fz={11.5} c="dimmed" mt={3}>
            {fmtDate(alerta.data)}
          </Text>
        </Box>
      </Group>
    </Card>
  );
}

export function AlertasPage() {
  const { itens, naoLidos, loading, error, reload, marcarLido } = useAlertas();
  const [tab, setTab] = useState<string>('todos');

  const cat = TAB_TO_CAT[tab];
  const filtrados = cat ? itens.filter((a) => a.cat === cat) : itens;

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={760} mx="auto">
        <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap">
          <Box>
            <Title order={1} fz={26} style={{ letterSpacing: '-0.01em' }}>
              Alertas
            </Title>
            <Text fz="sm" c="dimmed" mt={2}>
              A gente te avisa do que não pode perder.
            </Text>
          </Box>
          {naoLidos > 0 && (
            <Anchor
              component="button"
              type="button"
              fz={13}
              fw={600}
              onClick={marcarLido}
            >
              Marcar tudo como lido ({naoLidos})
            </Anchor>
          )}
        </Group>

        <Tabs value={tab} onChange={(v) => setTab(v ?? 'todos')} color="orange" variant="pills" mb="lg">
          <Tabs.List>
            <Tabs.Tab value="todos">Todos</Tabs.Tab>
            <Tabs.Tab value="prazos">Prazos</Tabs.Tab>
            <Tabs.Tab value="documentos">Documentos</Tabs.Tab>
            <Tabs.Tab value="ia">Resumo IA</Tabs.Tab>
            <Tabs.Tab value="resultados">Resultados</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {loading && itens.length === 0 ? (
          <LoadingCards count={3} />
        ) : error && itens.length === 0 ? (
          <ErrorState
            title="Não foi possível carregar os alertas."
            description="Verifique sua conexão e tente de novo."
            onRetry={reload}
          />
        ) : filtrados.length === 0 ? (
          <EmptyState
            title={
              itens.length === 0
                ? 'Nenhum alerta por enquanto.'
                : 'Nenhum alerta nesta categoria.'
            }
            description="Avisamos aqui sobre prazos, certidões vencendo, resumos prontos e resultados."
          />
        ) : (
          <Stack gap="sm">
            {filtrados.map((a) => (
              <AlertaRow key={a.id} alerta={a} />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
