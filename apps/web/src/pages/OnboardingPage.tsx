import {
  Alert,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconUpload } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/auth-context';
import {
  ApiError,
  getCompanyProfile,
  updateCompanyProfile,
  updateMunicipios,
} from '../lib/api';
import { ufName } from '../data/ufs';
import { useMunicipios } from '../hooks/useMunicipios';
import type {
  CompanyProfileInput,
  RegistroProfissionalTipo,
} from '../types/company-profile';

// Onboarding real (T-108): grava perfil + região no backend e leva à Home.
const LAST_STEP = 2; // 0 = Sua empresa · 1 = Documentos · 2 = Pronto

type StepState = 'done' | 'active' | 'todo';

function StepItem({
  n,
  title,
  sub,
  state,
}: {
  n: number;
  title: string;
  sub: string;
  state: StepState;
}) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <ThemeIcon
        radius="xl"
        size={28}
        variant={state === 'todo' ? 'light' : 'filled'}
        color={state === 'done' ? 'apto' : state === 'active' ? 'orange' : 'gray'}
        style={{ flex: 'none' }}
      >
        {state === 'done' ? <IconCheck size={15} /> : <Text fz={12} fw={700}>{n}</Text>}
      </ThemeIcon>
      <Box>
        <Text fz={14} fw={700} c={state === 'todo' ? 'concreto.6' : 'concreto.1'}>
          {title}
        </Text>
        <Text fz={12} c="concreto.6">
          {sub}
        </Text>
      </Box>
    </Group>
  );
}

export function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [active, setActive] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campos do perfil (persistem de verdade).
  const [razaoSocial, setRazaoSocial] = useState('');
  const [capitalSocial, setCapitalSocial] = useState<number | ''>('');
  const [telefone, setTelefone] = useState('');
  const [regTipo, setRegTipo] = useState<RegistroProfissionalTipo | null>(null);
  const [regNumero, setRegNumero] = useState('');
  const [municipiosSel, setMunicipiosSel] = useState<string[]>([]);

  const uf = user?.uf ?? '';
  const { municipios: municipiosDaUf } = useMunicipios(uf);

  // Opções do seletor de município: os da UF do usuário + os já preferidos
  // (que podem ser de outra UF — mostramos com o sufixo da UF pra não sumir).
  const municipioData = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of municipiosDaUf) map.set(m.codigoIbge, m.nome);
    for (const m of user?.municipios ?? []) {
      if (!map.has(m.codigoIbge)) map.set(m.codigoIbge, `${m.nome} (${m.uf})`);
    }
    return [...map].map(([value, label]) => ({ value, label }));
  }, [municipiosDaUf, user]);

  // Carrega o perfil atual (prefill) uma vez.
  useEffect(() => {
    let ativo = true;
    getCompanyProfile()
      .then((snap) => {
        if (!ativo) return;
        const p = snap.profile;
        if (p) {
          setRazaoSocial(p.razaoSocial ?? '');
          setCapitalSocial(p.capitalSocial ?? '');
          setTelefone(p.telefone ?? '');
          setRegTipo(p.registroProfissionalTipo);
          setRegNumero(p.registroProfissionalNumero ?? '');
        }
      })
      .catch(() => {
        /* prefill é conveniência; sem ele o usuário preenche do zero */
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Semeia os municípios já preferidos quando o usuário chega no contexto.
  useEffect(() => {
    setMunicipiosSel((user?.municipios ?? []).map((m) => m.codigoIbge));
  }, [user]);

  const next = () => setActive((a) => Math.min(LAST_STEP, a + 1));
  const prev = () => setActive((a) => Math.max(0, a - 1));

  async function salvarEmpresa() {
    setErro(null);
    setSalvando(true);
    try {
      const perfil: CompanyProfileInput = {};
      if (razaoSocial.trim()) perfil.razaoSocial = razaoSocial.trim();
      if (telefone.trim()) perfil.telefone = telefone.trim();
      if (typeof capitalSocial === 'number') perfil.capitalSocial = capitalSocial;
      if (regTipo) perfil.registroProfissionalTipo = regTipo;
      if (regNumero.trim()) perfil.registroProfissionalNumero = regNumero.trim();

      await Promise.all([
        Object.keys(perfil).length > 0
          ? updateCompanyProfile(perfil)
          : Promise.resolve(),
        updateMunicipios(municipiosSel),
      ]);
      await refreshUser();
      next();
    } catch (err) {
      setErro(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Não foi possível salvar. Verifique a conexão e tente novamente.',
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Group h="100vh" gap={0} wrap="nowrap" align="stretch">
      {/* painel de passos — só desktop */}
      <Box
        visibleFrom="md"
        p={48}
        style={{
          flex: '0 0 38%',
          backgroundColor: 'var(--mantine-color-graphite-9)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Logo variant="onDark" size={30} />
          <Title order={1} c="concreto.2" fz={34} mt={40} lh={1.05} style={{ letterSpacing: '-0.02em' }}>
            Vamos montar
            <br />o seu perfil.
          </Title>
          <Text c="concreto.5" fz="sm" mt="md" maw={320}>
            Leva 2 minutos. É com isso que a gente acha as obras certas pra você.
          </Text>

          <Stack gap="lg" mt={40}>
            <StepItem n={1} title="Conta criada" sub="Acesso confirmado" state="done" />
            <StepItem
              n={2}
              title="Sua empresa"
              sub="Região, capital e responsável técnico"
              state={active === 0 ? 'active' : 'done'}
            />
            <StepItem
              n={3}
              title="Documentos"
              sub="Suas certidões e atestados"
              state={active < 1 ? 'todo' : active === 1 ? 'active' : 'done'}
            />
          </Stack>
        </Box>

        <Text c="concreto.6" fz={12}>
          Você pode ajustar tudo isso depois, em Documentos e no seu perfil.
        </Text>
      </Box>

      {/* formulário */}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          backgroundColor: 'var(--mantine-color-concreto-2)',
          overflowY: 'auto',
        }}
      >
        <Box maw={720} mx="auto" px={{ base: 'md', sm: 'xl' }} py="xl">
          <Box hiddenFrom="md" mb="lg">
            <Logo variant="onLight" size={26} />
          </Box>

          {/* barra de progresso */}
          <Group gap={6} mb="xl">
            {[0, 1, 2].map((i) => (
              <Box
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 4,
                  backgroundColor:
                    i <= active + 1
                      ? 'var(--mantine-color-orange-7)'
                      : 'var(--mantine-color-concreto-4)',
                }}
              />
            ))}
          </Group>

          {erro && (
            <Alert
              color="alerta"
              variant="light"
              icon={<IconAlertTriangle size={18} />}
              mb="md"
            >
              {erro}
            </Alert>
          )}

          {active === 0 &&
            (carregando ? (
              <Center py={80}>
                <Loader />
              </Center>
            ) : (
              <Box>
                <Title order={2} fz={26} style={{ letterSpacing: '-0.01em' }}>
                  Sobre a sua empresa
                </Title>
                <Text fz="sm" c="dimmed" mt={2} mb="xl">
                  Quanto mais certo, melhores as obras que a gente te mostra.
                </Text>

                <Stack gap="lg">
                  <Group grow align="flex-start">
                    <TextInput
                      label="Razão social"
                      placeholder="Nome da sua empresa"
                      value={razaoSocial}
                      onChange={(e) => setRazaoSocial(e.currentTarget.value)}
                    />
                    <TextInput
                      label="Telefone de contato"
                      placeholder="(00) 00000-0000"
                      value={telefone}
                      onChange={(e) => setTelefone(e.currentTarget.value)}
                      inputMode="tel"
                    />
                  </Group>
                  <Group grow align="flex-start">
                    <NumberInput
                      label="Capital social"
                      placeholder="0"
                      value={capitalSocial}
                      onChange={(v) =>
                        setCapitalSocial(typeof v === 'number' ? v : '')
                      }
                      min={0}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                    />
                  </Group>

                  <Box>
                    <Text fz={14} fw={500} mb={4}>
                      Sua região
                    </Text>
                    <Text fz="sm" c="dimmed">
                      Cadastrada como <b>{uf ? ufName(uf) : '—'}</b>. As obras vêm
                      desse estado; escolha abaixo os municípios onde você atua.
                    </Text>
                  </Box>

                  <MultiSelect
                    label="Municípios onde você pega obra (opcional)"
                    description="Deixe vazio para ver o estado inteiro."
                    placeholder={municipiosSel.length ? undefined : 'Buscar cidade'}
                    data={municipioData}
                    value={municipiosSel}
                    onChange={setMunicipiosSel}
                    searchable
                    clearable
                    hidePickedOptions
                    maxValues={20}
                  />

                  <Group grow align="flex-start">
                    <Select
                      label="Conselho do responsável técnico"
                      placeholder="CREA ou CAU"
                      data={[
                        { value: 'CREA', label: 'CREA (engenharia)' },
                        { value: 'CAU', label: 'CAU (arquitetura)' },
                      ]}
                      value={regTipo}
                      onChange={(v) =>
                        setRegTipo(v as RegistroProfissionalTipo | null)
                      }
                      clearable
                    />
                    <TextInput
                      label="Número do registro"
                      placeholder="Ex.: 0987654"
                      value={regNumero}
                      onChange={(e) => setRegNumero(e.currentTarget.value)}
                    />
                  </Group>
                </Stack>
              </Box>
            ))}

          {active === 1 && (
            <Box>
              <Title order={2} fz={26} style={{ letterSpacing: '-0.01em' }}>
                Documentos de habilitação
              </Title>
              <Text fz="sm" c="dimmed" mt={2} mb="xl">
                Suas certidões ficam no cofre e são reaproveitadas em cada edital.
                Você pode enviar agora ou depois.
              </Text>
              <Card radius="lg" p="xl" style={{ border: '2px dashed var(--mantine-color-concreto-5)' }}>
                <Stack align="center" gap={6}>
                  <ThemeIcon variant="light" color="gray" radius="xl" size={44}>
                    <IconUpload size={22} />
                  </ThemeIcon>
                  <Text fz={14} fw={600}>
                    CND, FGTS, CNDT, contrato social, balanço, CAT…
                  </Text>
                  <Text fz={12} c="dimmed" ta="center" maw={360}>
                    O envio acontece no cofre de documentos, onde cada arquivo é
                    ligado ao tipo de certidão.
                  </Text>
                  <Button mt="xs" color="orange" onClick={() => navigate('/documentos')}>
                    Enviar documentos agora
                  </Button>
                </Stack>
              </Card>
              <Text fz={12.5} c="dimmed" mt="sm">
                Sem pressa: você pode pular e enviar depois, em Documentos.
              </Text>
            </Box>
          )}

          {active === 2 && (
            <Stack align="center" gap="xs" py={48}>
              <ThemeIcon color="apto" variant="light" radius="xl" size={64}>
                <IconCheck size={30} />
              </ThemeIcon>
              <Title order={2} fz={24} mt="sm">
                Tudo pronto!
              </Title>
              <Text fz="sm" c="dimmed" ta="center" maw={400} style={{ lineHeight: 1.5 }}>
                Seu perfil está configurado. Já encontramos editais de obra pública na
                sua região esperando por você.
              </Text>
            </Stack>
          )}

          <Group justify="space-between" mt={48}>
            {active === 1 ? (
              <Button variant="subtle" color="gray" onClick={prev}>
                ‹ Voltar
              </Button>
            ) : (
              <div />
            )}
            {active === 0 && (
              <Button color="orange" onClick={salvarEmpresa} loading={salvando}>
                Salvar e continuar
              </Button>
            )}
            {active === 1 && (
              <Button color="orange" onClick={next}>
                Pular por enquanto
              </Button>
            )}
            {active === LAST_STEP && (
              <Button color="orange" onClick={() => navigate('/')}>
                Ir para o início
              </Button>
            )}
          </Group>
        </Box>
      </Box>
    </Group>
  );
}
