import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Group,
  PasswordInput,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconDownload,
  IconPointFilled,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorState, LoadingCards } from '../components/StateViews';
import { useAuth } from '../context/auth-context';
import { useCompanyProfile } from '../hooks/useCompanyProfile';
import {
  ApiError,
  changePassword,
  excluirConta,
  exportarMeusDados,
  updateNotificationPrefs,
} from '../lib/api';
import { ufName } from '../data/ufs';
import { brl } from '../lib/format';

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

// Equipe & Plano dependem de T-87 (convites) e T-88/Épico 11 (assinatura) — ainda
// sem backend. Placeholder honesto até essas tasks existirem (T-99).
function EquipePlano() {
  return (
    <Card withBorder radius="lg" p="xl" maw={560}>
      <Group gap="md" wrap="nowrap" align="flex-start">
        <ThemeIcon
          variant="light"
          color="gray"
          radius="md"
          size={44}
          style={{ flex: 'none' }}
        >
          <IconUsers size={22} />
        </ThemeIcon>
        <Box>
          <Text fz={16} fw={700} ff="heading">
            Equipe &amp; Plano
          </Text>
          <Text fz={13.5} c="dimmed" mt={4}>
            Convidar membros da equipe e gerenciar a assinatura chegam em breve.
            Por enquanto sua conta é individual e o acesso está liberado.
          </Text>
        </Box>
      </Group>
    </Card>
  );
}

function DadosEmpresa() {
  const { user } = useAuth();
  const { state, reload } = useCompanyProfile();

  if (state.status === 'loading') return <LoadingCards count={3} />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title="Não foi possível carregar seu perfil"
        description={state.message}
        onRetry={reload}
      />
    );
  }

  const { profile, atestados } = state.data;
  const nome = profile?.razaoSocial ?? user?.name ?? 'Sua empresa';
  const cnpj = user?.cnpj;
  const porte = user?.porte;
  const uf = user?.uf ?? null;
  const municipios = user?.municipios ?? [];
  const registro =
    profile?.registroProfissionalTipo && profile?.registroProfissionalNumero
      ? `${profile.registroProfissionalTipo} ${profile.registroProfissionalNumero}` +
        (profile.registroProfissionalUf
          ? ` / ${profile.registroProfissionalUf}`
          : '')
      : null;

  const cabecalho = [
    cnpj ? `CNPJ ${cnpj}` : null,
    porte ? `Porte ${porte}` : null,
    uf ? ufName(uf) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box>
      <Card withBorder radius="lg" p="xl">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            <Avatar
              color="orange"
              variant="filled"
              radius="md"
              size={60}
              style={{ flex: 'none' }}
            >
              {initials(nome)}
            </Avatar>
            <Box>
              <Title order={2} fz={19}>
                {nome}
              </Title>
              <Text fz={13} c="dimmed" mt={2}>
                {cabecalho || '—'}
              </Text>
              <Text fz={13} c="dimmed" mt={2}>
                {user?.email}
                {profile?.telefone ? ` · ${profile.telefone}` : ''}
              </Text>
            </Box>
          </Group>
          <Button
            component={Link}
            to="/onboarding"
            variant="default"
            size="sm"
            style={{ flex: 'none' }}
          >
            Editar dados
          </Button>
        </Group>
      </Card>

      <SectionLabel>Municípios de atuação</SectionLabel>
      <Card withBorder radius="md" px="lg" py={municipios.length ? 6 : 'md'}>
        {municipios.length === 0 ? (
          <Text fz={13.5} c="dimmed">
            Nenhum município específico — você vê as obras do estado inteiro
            {uf ? ` (${ufName(uf)})` : ''}. Configure em “Editar dados”.
          </Text>
        ) : (
          municipios.map((m, i) => (
            <Group
              key={m.codigoIbge}
              gap={6}
              py="sm"
              wrap="nowrap"
              style={{
                borderBottom:
                  i < municipios.length - 1
                    ? '1px solid var(--mantine-color-gray-1)'
                    : undefined,
              }}
            >
              <IconPointFilled size={16} color="var(--mantine-color-orange-8)" />
              <Text fz={13.5} c="gray.7">
                {m.nome} / {m.uf}
              </Text>
            </Group>
          ))
        )}
      </Card>

      <SectionLabel>Qualificação econômico-financeira</SectionLabel>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Card withBorder radius="md" p="md">
          <Text className="brand-label" mb={6}>
            Capital social
          </Text>
          <Text fz={18} fw={700}>
            {profile?.capitalSocial != null
              ? brl(profile.capitalSocial)
              : 'Não informado'}
          </Text>
        </Card>
        <Card withBorder radius="md" p="md">
          <Text className="brand-label" mb={6}>
            Registro no conselho (CREA/CAU)
          </Text>
          <Text fz={18} fw={700}>
            {registro ?? 'Não informado'}
          </Text>
        </Card>
      </SimpleGrid>

      <SectionLabel>Acervo técnico (obras executadas)</SectionLabel>
      {atestados.length === 0 ? (
        <Card withBorder radius="md" p="lg">
          <Text fz={13.5} c="dimmed">
            Nenhum atestado cadastrado ainda. Adicione seus atestados de
            capacidade técnica no cofre de Documentos.
          </Text>
          <Button
            component={Link}
            to="/documentos"
            variant="light"
            color="orange"
            size="xs"
            mt="sm"
          >
            Ir para Documentos
          </Button>
        </Card>
      ) : (
        <Stack gap="sm">
          {atestados.map((a) => (
            <Card key={a.id} withBorder radius="md" p="md">
              <Group
                justify="space-between"
                align="flex-start"
                wrap="nowrap"
                gap="lg"
              >
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text fz={14} fw={600}>
                    {a.descricao}
                  </Text>
                  <Text fz={12.5} c="dimmed" mt={3}>
                    {[a.contratante, a.ano].filter(Boolean).join(' · ') ||
                      'Sem detalhes'}
                  </Text>
                </Box>
                {a.valor != null && (
                  <Box style={{ flex: 'none', textAlign: 'right' }}>
                    <Text className="brand-label">Valor</Text>
                    <Text fz={15} fw={700}>
                      {brl(a.valor)}
                    </Text>
                  </Box>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
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
          label="WhatsApp (em breve)"
          description="Por enquanto avisamos por e-mail; WhatsApp está a caminho"
        />
        <Switch
          checked={prefs.email}
          onChange={(e) => void toggle('email', e.currentTarget.checked)}
          color="apto"
          label="E-mail"
          description="Certidões vencendo e prazos de entrega próximos"
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
    <Stack gap="lg" maw={460}>
    <Card withBorder radius="lg" p="lg">
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
          <Button
            color="orange"
            onClick={() => void salvar()}
            disabled={!podeSalvar}
            loading={salvando}
          >
            Salvar
          </Button>
        </Group>
      </Stack>
    </Card>
    <DadosLgpd />
    </Stack>
  );
}

// Direitos do titular LGPD (T-102): exportar todos os dados e excluir a conta
// (exige a senha; hard delete com cascade no backend).
function DadosLgpd() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [exportando, setExportando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [senha, setSenha] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function exportar() {
    setErro(null);
    setExportando(true);
    try {
      await exportarMeusDados();
    } catch {
      setErro('Não foi possível exportar agora. Tente de novo.');
    } finally {
      setExportando(false);
    }
  }

  async function confirmarExclusao() {
    setErro(null);
    if (!senha) {
      setErro('Digite sua senha para confirmar.');
      return;
    }
    setExcluindo(true);
    try {
      await excluirConta(senha);
      await logout();
      navigate('/login', { replace: true });
    } catch (e) {
      setErro(
        e instanceof ApiError && e.status === 401
          ? 'Senha incorreta.'
          : 'Não foi possível excluir a conta agora.',
      );
      setExcluindo(false);
    }
  }

  return (
    <Card withBorder radius="lg" p="lg">
      <Text fz={16} fw={700} ff="heading" mb={4}>
        Seus dados (LGPD)
      </Text>
      <Text fz={13} c="dimmed" mb="md">
        Você pode baixar tudo que guardamos sobre você ou excluir sua conta.
      </Text>
      <Group>
        <Button
          variant="default"
          leftSection={<IconDownload size={16} />}
          onClick={() => void exportar()}
          loading={exportando}
        >
          Exportar meus dados
        </Button>
        {!confirmar && (
          <Button
            variant="light"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              setConfirmar(true);
              setErro(null);
            }}
          >
            Excluir minha conta
          </Button>
        )}
      </Group>

      {confirmar && (
        <Card
          withBorder
          radius="md"
          mt="md"
          p="md"
          style={{ borderColor: 'var(--mantine-color-red-2)' }}
        >
          <Text fz={13.5} fw={600} c="red.7" mb="xs">
            Excluir a conta é definitivo
          </Text>
          <Text fz={12.5} c="dimmed" mb="sm">
            Isso remove seu perfil, certidões, atestados, propostas, favoritos e
            arquivos anexados. Não dá para desfazer.
          </Text>
          <PasswordInput
            label="Confirme com sua senha"
            value={senha}
            onChange={(e) => setSenha(e.currentTarget.value)}
            mb="sm"
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => {
                setConfirmar(false);
                setSenha('');
                setErro(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              color="red"
              onClick={() => void confirmarExclusao()}
              loading={excluindo}
            >
              Excluir definitivamente
            </Button>
          </Group>
        </Card>
      )}

      {erro && (
        <Alert color="alerta" variant="light" radius="md" mt="md">
          {erro}
        </Alert>
      )}
    </Card>
  );
}

export function PerfilPage() {
  const [tab, setTab] = useState<string>('dados');

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={1040} mx="auto">
        <Title order={1} fz={26} mb="md" style={{ letterSpacing: '-0.01em' }}>
          Configurações
        </Title>

        <Tabs value={tab} onChange={(v) => setTab(v ?? 'dados')} color="orange" mb="lg">
          <Tabs.List>
            <Tabs.Tab value="dados">Dados da empresa</Tabs.Tab>
            <Tabs.Tab value="notif">Notificações</Tabs.Tab>
            <Tabs.Tab value="seguranca">Segurança</Tabs.Tab>
            <Tabs.Tab value="equipe">Equipe &amp; Plano</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="dados" pt="lg">
            <DadosEmpresa />
          </Tabs.Panel>
          <Tabs.Panel value="notif" pt="lg">
            <Notificacoes />
          </Tabs.Panel>
          <Tabs.Panel value="seguranca" pt="lg">
            <Seguranca />
          </Tabs.Panel>
          <Tabs.Panel value="equipe" pt="lg">
            <EquipePlano />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </Box>
  );
}
