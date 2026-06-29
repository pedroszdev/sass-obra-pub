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

// ⚠️ DADOS MOCKADOS — central de notificações ainda sem backend (CLAUDE.md §7).
type AlertaCat = 'obra' | 'prazo' | 'documento' | 'ia' | 'orcamento';
type Grupo = 'hoje' | 'semana';

interface Alerta {
  id: number;
  cat: AlertaCat;
  icon: Icon;
  color: string;
  lead: string;
  tail: string;
  meta: string;
  grupo: Grupo;
  unread: boolean;
}

const ALERTAS: Alerta[] = [
  {
    id: 1,
    cat: 'obra',
    icon: IconBuildingEstate,
    color: 'orange',
    lead: 'Nova obra que você pode ganhar:',
    tail: ' reforma de creche em Itaquera. Você está apto.',
    meta: 'há 2 horas · SP Capital',
    grupo: 'hoje',
    unread: true,
  },
  {
    id: 2,
    cat: 'prazo',
    icon: IconClock,
    color: 'alerta',
    lead: 'Proposta fecha amanhã:',
    tail: ' Pavimentação Rod. SP-332. Faltam 22 horas.',
    meta: 'há 5 horas · DER-SP',
    grupo: 'hoje',
    unread: true,
  },
  {
    id: 3,
    cat: 'documento',
    icon: IconFileText,
    color: 'orange',
    lead: 'Sua Certidão FGTS vence em 8 dias.',
    tail: ' Renove pra continuar habilitado.',
    meta: 'ontem · Documentos',
    grupo: 'semana',
    unread: false,
  },
  {
    id: 4,
    cat: 'ia',
    icon: IconSparkles,
    color: 'apto',
    lead: 'O resumo da UBS Vila Augusta ficou pronto.',
    tail: ' A IA leu 84 páginas — você está apto.',
    meta: '2 dias atrás · Resumo IA',
    grupo: 'semana',
    unread: false,
  },
  {
    id: 5,
    cat: 'orcamento',
    icon: IconChartBar,
    color: 'apto',
    lead: 'Resultado: você ganhou',
    tail: ' a Quadra Poliesportiva de Osasco por R$ 540 mil. Parabéns!',
    meta: '3 dias atrás · Orçamentos',
    grupo: 'semana',
    unread: false,
  },
];

const TAB_TO_CAT: Record<string, AlertaCat | null> = {
  todos: null,
  obras: 'obra',
  prazos: 'prazo',
  documentos: 'documento',
};

const GRUPO_LABEL: Record<Grupo, string> = {
  hoje: 'Hoje',
  semana: 'Esta semana',
};

function AlertaRow({ alerta, lido }: { alerta: Alerta; lido: boolean }) {
  const ItemIcon = alerta.icon;
  return (
    <Card withBorder radius="md" p="md">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Box
          w={7}
          h={7}
          mt={6}
          style={{
            flex: 'none',
            borderRadius: '50%',
            backgroundColor:
              alerta.unread && !lido
                ? 'var(--mantine-color-orange-6)'
                : 'transparent',
          }}
        />
        <ThemeIcon color={alerta.color} variant="light" radius="md" size={36} style={{ flex: 'none' }}>
          <ItemIcon size={18} />
        </ThemeIcon>
        <Box style={{ minWidth: 0 }}>
          <Text fz={14} style={{ lineHeight: 1.4 }}>
            <Text span fw={700}>
              {alerta.lead}
            </Text>
            {alerta.tail}
          </Text>
          <Text fz={12} c="dimmed" mt={2}>
            {alerta.meta}
          </Text>
        </Box>
      </Group>
    </Card>
  );
}

export function AlertasPage() {
  const [tab, setTab] = useState<string>('todos');
  const [lidoTudo, setLidoTudo] = useState(false);

  const cat = TAB_TO_CAT[tab];
  const filtrados = cat ? ALERTAS.filter((a) => a.cat === cat) : ALERTAS;
  const grupos: Grupo[] = ['hoje', 'semana'];

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
          <Anchor component="button" type="button" fz={13} fw={600} onClick={() => setLidoTudo(true)}>
            Marcar tudo como lido
          </Anchor>
        </Group>

        <Tabs value={tab} onChange={(v) => setTab(v ?? 'todos')} color="orange" variant="pills" mb="lg">
          <Tabs.List>
            <Tabs.Tab value="todos">Todos</Tabs.Tab>
            <Tabs.Tab value="obras">Obras</Tabs.Tab>
            <Tabs.Tab value="prazos">Prazos</Tabs.Tab>
            <Tabs.Tab value="documentos">Documentos</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {filtrados.length === 0 ? (
          <Card withBorder radius="md" p="xl">
            <Text fz={14} c="dimmed" ta="center">
              Nenhum alerta nesta categoria.
            </Text>
          </Card>
        ) : (
          <Stack gap="lg">
            {grupos.map((g) => {
              const itens = filtrados.filter((a) => a.grupo === g);
              if (itens.length === 0) return null;
              return (
                <Box key={g}>
                  <Text className="brand-label" mb="sm">
                    {GRUPO_LABEL[g]}
                  </Text>
                  <Stack gap="sm">
                    {itens.map((a) => (
                      <AlertaRow key={a.id} alerta={a} lido={lidoTudo} />
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}

        <Text fz={11} c="dimmed" mt="xl">
          Alertas de exemplo — a central de notificações ainda está em construção.
        </Text>
      </Box>
    </Box>
  );
}
