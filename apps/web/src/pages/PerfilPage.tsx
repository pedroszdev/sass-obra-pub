import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Group,
  PasswordInput,
  Progress,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconCheck, IconCreditCard, IconPlus, IconPointFilled } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { ApiError, changePassword, updateNotificationPrefs } from '../lib/api';
import { brl } from '../lib/format';
import { MOCK_COMPANY } from '../mocks';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="brand-label" mt="xl" mb="sm">
      {children}
    </Text>
  );
}

// ⚠️ DADOS MOCKADOS — equipe, plano e cobrança ainda sem backend (CLAUDE.md §7).
const MOCK_EQUIPE = [
  { nome: 'Sérgio Tavares', sub: 'sergio@tavares.com.br', funcao: 'Dono', status: 'Ativo' },
  { nome: 'Renata Paiva', sub: 'Engenheira · orçamentos', funcao: 'Editor', status: 'Ativo' },
  { nome: 'João Mendes', sub: 'joao@tavares.com.br', funcao: 'Leitor', status: 'Convite' },
];
const PLANO_FEATURES = [
  'Radar do estado inteiro',
  'Resumo com IA ilimitado',
  'Até 5 usuários da equipe',
  'Suporte por WhatsApp',
];

function EquipePlano() {
  const [prefs, setPrefs] = useState({ obra: true, prazo: true, certidao: false });
  return (
    <Flex gap="lg" align="flex-start" direction={{ base: 'column', md: 'row' }}>
      <Box style={{ flex: 1, minWidth: 0 }} w={{ base: '100%', md: 'auto' }}>
        <Card withBorder radius="lg" p="lg" mb="lg">
          <Group justify="space-between" mb="sm">
            <Text fz={16} fw={700} ff="heading">
              Equipe
            </Text>
            <Button color="graphite" size="xs" leftSection={<IconPlus size={15} />}>
              Convidar membro
            </Button>
          </Group>
          <Table verticalSpacing="sm" styles={{ th: { fontFamily: 'var(--mantine-font-family-monospace)', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.06em', fontWeight: 500, color: 'var(--mantine-color-graphite-5)' } }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Membro</Table.Th>
                <Table.Th>Função</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {MOCK_EQUIPE.map((m) => (
                <Table.Tr key={m.nome}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <Avatar color="orange" variant="filled" radius="xl" size={32}>
                        {initials(m.nome)}
                      </Avatar>
                      <Box style={{ minWidth: 0 }}>
                        <Text fz={13.5} fw={600} lineClamp={1}>
                          {m.nome}
                        </Text>
                        <Text fz={12} c="dimmed" lineClamp={1}>
                          {m.sub}
                        </Text>
                      </Box>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text fz={13}>{m.funcao}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={m.status === 'Ativo' ? 'apto' : 'gray'} variant="light" radius="sm" tt="none">
                      {m.status}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>

        <Card withBorder radius="lg" p="lg">
          <Text fz={16} fw={700} ff="heading" mb="md">
            Preferências de alerta
          </Text>
          <Stack gap="md">
            <Switch
              checked={prefs.obra}
              onChange={(e) => setPrefs((p) => ({ ...p, obra: e.currentTarget.checked }))}
              color="apto"
              label="Nova obra na minha região"
              description="WhatsApp + e-mail"
            />
            <Switch
              checked={prefs.prazo}
              onChange={(e) => setPrefs((p) => ({ ...p, prazo: e.currentTarget.checked }))}
              color="apto"
              label="Prazo de proposta encerrando"
              description="WhatsApp"
            />
            <Switch
              checked={prefs.certidao}
              onChange={(e) => setPrefs((p) => ({ ...p, certidao: e.currentTarget.checked }))}
              color="apto"
              label="Certidão vencendo"
              description="E-mail"
            />
          </Stack>
        </Card>
      </Box>

      {/* coluna do plano */}
      <Box w={{ base: '100%', md: 320 }} style={{ flex: 'none' }}>
        <Stack gap="lg">
          <Card radius="lg" p="lg" bg="graphite.9" c="concreto.2">
            <Text className="brand-label" c="orange.6">
              Seu plano
            </Text>
            <Group gap={6} align="baseline" mt={6} mb="md">
              <Title order={2} fz={26} c="concreto.0">
                Construtora
              </Title>
              <Text fz={15} fw={700} c="orange.5">
                R$ 247
              </Text>
              <Text fz={13} c="concreto.5">
                /mês
              </Text>
            </Group>
            <Stack gap="xs">
              {PLANO_FEATURES.map((f) => (
                <Group key={f} gap="xs" wrap="nowrap">
                  <IconCheck size={15} color="var(--mantine-color-orange-5)" stroke={2.6} />
                  <Text fz={13} c="concreto.3">
                    {f}
                  </Text>
                </Group>
              ))}
            </Stack>
            <Text fz={12} c="concreto.6" mt="md">
              Renova em 22 dias
            </Text>
          </Card>

          <Card withBorder radius="lg" p="lg">
            <Text className="brand-label" mb="md">
              Uso deste mês
            </Text>
            <Text fz={12} c="dimmed" mb={4}>
              Usuários · 3 de 5
            </Text>
            <Progress value={60} color="orange" radius="xl" mb="md" />
            <Text fz={12} c="dimmed" mb={4}>
              Resumos com IA · ilimitado
            </Text>
            <Progress value={35} color="apto" radius="xl" />
          </Card>

          <Card withBorder radius="lg" p="lg">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" color="gray" radius="md" size={36}>
                <IconCreditCard size={18} />
              </ThemeIcon>
              <Box>
                <Text fz={13.5} fw={600}>
                  Visa final 4821
                </Text>
                <Text fz={12} c="dimmed">
                  Próxima cobrança 18/07/2026
                </Text>
              </Box>
            </Group>
          </Card>
        </Stack>
      </Box>
    </Flex>
  );
}

function DadosEmpresa() {
  const { user } = useAuth();
  const nome = user?.name ?? MOCK_COMPANY.nome;
  const cnpj = user?.cnpj ?? MOCK_COMPANY.cnpj;
  const porte = user?.porte ?? MOCK_COMPANY.porte;
  const uf = user?.uf ?? MOCK_COMPANY.uf;
  const local = `${MOCK_COMPANY.municipio} / ${uf}`;

  return (
    <Box>
      <Card withBorder radius="lg" p="xl">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            <Avatar color="orange" variant="filled" radius="md" size={60} style={{ flex: 'none' }}>
              {initials(nome)}
            </Avatar>
            <Box>
              <Title order={2} fz={19}>
                {nome}
              </Title>
              <Text fz={13} c="dimmed" mt={2}>
                CNPJ {cnpj} · Porte {porte} · {local} · desde {MOCK_COMPANY.fundacao}
              </Text>
            </Box>
          </Group>
          <Group gap="xs" style={{ flex: 'none' }}>
            <Button component={Link} to="/onboarding" variant="outline" color="orange" size="sm">
              Refazer configuração
            </Button>
            <Button variant="default" size="sm">
              Editar perfil
            </Button>
          </Group>
        </Group>
      </Card>

      <SectionLabel>Qualificação econômico-financeira</SectionLabel>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        {[
          ['Capital social', brl(MOCK_COMPANY.capitalSocial)],
          ['Faturamento anual', brl(MOCK_COMPANY.faturamento)],
          ['Índice de liquidez', String(MOCK_COMPANY.liquidez)],
        ].map(([label, value]) => (
          <Card key={label} withBorder radius="md" p="md">
            <Text className="brand-label" mb={6}>
              {label}
            </Text>
            <Text fz={18} fw={700}>
              {value}
            </Text>
          </Card>
        ))}
      </SimpleGrid>

      <SectionLabel>Ramos de atuação (CNAE)</SectionLabel>
      <Card withBorder radius="md" px="lg" py={6}>
        {MOCK_COMPANY.cnaes.map((cnae, i) => (
          <Text
            key={cnae}
            fz={13.5}
            c="gray.7"
            py="sm"
            style={{
              borderBottom:
                i < MOCK_COMPANY.cnaes.length - 1
                  ? '1px solid var(--mantine-color-gray-1)'
                  : undefined,
            }}
          >
            {cnae}
          </Text>
        ))}
      </Card>

      <SectionLabel>Acervo técnico (obras executadas)</SectionLabel>
      <Stack gap="sm">
        {MOCK_COMPANY.acervo.map((obra) => (
          <Card key={obra.art} withBorder radius="md" p="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap" gap="lg">
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text fz={14} fw={600}>
                  {obra.obra}
                </Text>
                <Text fz={12.5} c="dimmed" mt={3}>
                  {obra.orgao} · {obra.ano} · ART/CAT {obra.art}
                </Text>
              </Box>
              <Box style={{ flex: 'none', textAlign: 'right' }}>
                <Text className="brand-label">Valor</Text>
                <Text fz={15} fw={700}>
                  {brl(obra.valor)}
                </Text>
              </Box>
            </Group>
          </Card>
        ))}
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="xl">
        <Box>
          <Text className="brand-label" mb="sm">
            Responsáveis técnicos
          </Text>
          <Card withBorder radius="md" px="lg" py={6}>
            {MOCK_COMPANY.responsaveis.map((resp, i) => (
              <Group
                key={resp.registro}
                gap="sm"
                py="sm"
                wrap="nowrap"
                style={{
                  borderBottom:
                    i < MOCK_COMPANY.responsaveis.length - 1
                      ? '1px solid var(--mantine-color-gray-1)'
                      : undefined,
                }}
              >
                <Avatar color="orange" radius="xl" size={34} style={{ flex: 'none' }}>
                  {initials(resp.nome.replace(/^Eng\.\s*/, ''))}
                </Avatar>
                <Box style={{ minWidth: 0 }}>
                  <Text fz={13.5} fw={600}>
                    {resp.nome}
                  </Text>
                  <Text fz={12} c="dimmed">
                    {resp.registro} · {resp.formacao}
                  </Text>
                </Box>
              </Group>
            ))}
          </Card>
        </Box>
        <Box>
          <Text className="brand-label" mb="sm">
            Regiões de interesse
          </Text>
          <Card withBorder radius="md" px="lg" py={6}>
            {MOCK_COMPANY.regioes.map((regiao, i) => (
              <Group
                key={regiao}
                gap={6}
                py="sm"
                wrap="nowrap"
                style={{
                  borderBottom:
                    i < MOCK_COMPANY.regioes.length - 1
                      ? '1px solid var(--mantine-color-gray-1)'
                      : undefined,
                }}
              >
                <IconPointFilled size={16} color="var(--mantine-color-orange-8)" />
                <Text fz={13.5} c="gray.7">
                  {regiao}
                </Text>
              </Group>
            ))}
          </Card>
        </Box>
      </SimpleGrid>
    </Box>
  );
}

function Notificacoes() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(
    () => user?.notificationPrefs ?? { whatsapp: true, email: true },
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function toggle(canal: 'whatsapp' | 'email', value: boolean) {
    const anterior = prefs;
    const proximo = { ...prefs, [canal]: value };
    setPrefs(proximo); // otimista
    setSalvando(true);
    setErro(null);
    try {
      await updateNotificationPrefs(proximo);
    } catch {
      setPrefs(anterior); // reverte
      setErro('Não foi possível salvar agora. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card withBorder radius="lg" p="lg" maw={560}>
      <Group justify="space-between" mb="md">
        <Text fz={16} fw={700} ff="heading">
          Canais de notificação
        </Text>
        {salvando && (
          <Text fz={12} c="dimmed">
            Salvando…
          </Text>
        )}
      </Group>
      <Stack gap="md">
        <Switch
          checked={prefs.whatsapp}
          onChange={(e) => void toggle('whatsapp', e.currentTarget.checked)}
          color="apto"
          label="WhatsApp"
          description="Avisos de obra, prazo e resultado"
        />
        <Switch
          checked={prefs.email}
          onChange={(e) => void toggle('email', e.currentTarget.checked)}
          color="apto"
          label="E-mail"
          description="Resumo diário e documentos vencendo"
        />
        <Switch
          checked={false}
          color="apto"
          label="Push no navegador"
          description="Em breve"
          disabled
        />
      </Stack>
      {erro && (
        <Alert color="alerta" variant="light" radius="md" mt="md">
          {erro}
        </Alert>
      )}
    </Card>
  );
}

function Seguranca() {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const podeSalvar =
    atual.length > 0 && nova.length >= 8 && nova === confirma && !salvando;

  async function salvar() {
    setErro(null);
    setOk(false);
    if (nova.length < 8) {
      setErro('A nova senha precisa de pelo menos 8 caracteres.');
      return;
    }
    if (nova !== confirma) {
      setErro('A confirmação não bate com a nova senha.');
      return;
    }
    setSalvando(true);
    try {
      await changePassword(atual, nova);
      setOk(true);
      setAtual('');
      setNova('');
      setConfirma('');
    } catch (e) {
      setErro(
        e instanceof ApiError && e.status === 401
          ? 'Senha atual incorreta.'
          : e instanceof ApiError
            ? e.message
            : 'Não foi possível trocar a senha agora.',
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card withBorder radius="lg" p="lg" maw={460}>
      <Text fz={16} fw={700} ff="heading" mb="md">
        Alterar senha
      </Text>
      <Stack gap="md">
        <PasswordInput
          label="Senha atual"
          placeholder="Sua senha atual"
          value={atual}
          onChange={(e) => setAtual(e.currentTarget.value)}
        />
        <PasswordInput
          label="Nova senha"
          placeholder="Mínimo 8 caracteres"
          value={nova}
          onChange={(e) => setNova(e.currentTarget.value)}
        />
        <PasswordInput
          label="Confirmar nova senha"
          placeholder="Repita a nova senha"
          value={confirma}
          onChange={(e) => setConfirma(e.currentTarget.value)}
        />
        {erro && (
          <Alert color="alerta" variant="light" radius="md">
            {erro}
          </Alert>
        )}
        {ok && (
          <Alert color="apto" variant="light" radius="md">
            Senha alterada. As outras sessões foram encerradas.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button color="orange" onClick={() => void salvar()} disabled={!podeSalvar} loading={salvando}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function PerfilPage() {
  const [tab, setTab] = useState<string>('equipe');

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={1040} mx="auto">
        <Title order={1} fz={26} mb="md" style={{ letterSpacing: '-0.01em' }}>
          Configurações
        </Title>

        <Tabs value={tab} onChange={(v) => setTab(v ?? 'equipe')} color="orange" mb="lg">
          <Tabs.List>
            <Tabs.Tab value="equipe">Equipe &amp; Plano</Tabs.Tab>
            <Tabs.Tab value="dados">Dados da empresa</Tabs.Tab>
            <Tabs.Tab value="notif">Notificações</Tabs.Tab>
            <Tabs.Tab value="seguranca">Segurança</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="equipe" pt="lg">
            <EquipePlano />
          </Tabs.Panel>
          <Tabs.Panel value="dados" pt="lg">
            <DadosEmpresa />
          </Tabs.Panel>
          <Tabs.Panel value="notif" pt="lg">
            <Notificacoes />
          </Tabs.Panel>
          <Tabs.Panel value="seguranca" pt="lg">
            <Seguranca />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </Box>
  );
}
