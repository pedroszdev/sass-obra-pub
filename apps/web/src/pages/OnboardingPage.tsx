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
import {
  IconAlertTriangle,
  IconCertificate,
  IconCheck,
  IconFileText,
  IconUpload,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtestadoFormModal } from '../components/AtestadoFormModal';
import { CertidaoFormModal } from '../components/CertidaoFormModal';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/auth-context';
import {
  ApiError,
  updateCompanyProfile,
  updateMunicipios,
  updateUf,
} from '../lib/api';
import { UFS, ufName } from '../data/ufs';
import { useCompanyProfile } from '../hooks/useCompanyProfile';
import { useMunicipios } from '../hooks/useMunicipios';
import { CERTIDAO_TIPO_LABELS, validadeLabel } from '../lib/certidao';
import { formatarTelefone, telefoneValido } from '../lib/telefone';
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from '../lib/onboarding-draft';
import type {
  CompanyProfileInput,
  RegistroProfissionalTipo,
} from '../types/company-profile';

// Onboarding real (T-108): grava perfil + região no backend e leva à Home.
const LAST_STEP = 2; // 0 = Sua empresa · 1 = Documentos · 2 = Pronto

const UF_OPTIONS = UFS.map((uf) => ({ value: uf.code, label: uf.name }));

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

  // Rascunho persistido (T-167): lê o sessionStorage UMA vez no mount. Se existe,
  // o usuário estava no meio do onboarding e deu F5 — o rascunho é a fonte mais
  // recente e supera o prefill do backend e o seeding de municípios abaixo.
  const draftInicial = useRef<ReturnType<typeof loadOnboardingDraft> | undefined>(
    undefined,
  );
  if (draftInicial.current === undefined) {
    draftInicial.current = loadOnboardingDraft();
  }
  const veioDeRascunho = useRef(draftInicial.current != null);

  const [active, setActive] = useState(() => draftInicial.current?.active ?? 0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Um único snapshot do cofre serve a duas coisas: o prefill do passo 1 e a
  // lista de documentos do passo 2 (que recarrega a cada doc cadastrado).
  const { state: perfilState, reload: reloadPerfil } = useCompanyProfile();
  const carregando = perfilState.status === 'loading';

  // Modais do cofre (os mesmos da página de Documentos) — evita mandar o
  // usuário pra fora do onboarding no meio do fluxo.
  const [certidaoModal, setCertidaoModal] = useState(false);
  const [atestadoModal, setAtestadoModal] = useState(false);

  // Campos do perfil (persistem de verdade). O valor inicial vem do rascunho
  // (T-167) quando há um — senão, dos defaults + prefill do backend.
  const d0 = draftInicial.current;
  const [razaoSocial, setRazaoSocial] = useState(d0?.razaoSocial ?? '');
  const [capitalSocial, setCapitalSocial] = useState<number | ''>(
    d0?.capitalSocial ?? '',
  );
  const [patrimonioLiquido, setPatrimonioLiquido] = useState<number | ''>(
    d0?.patrimonioLiquido ?? '',
  );
  const [telefone, setTelefone] = useState(d0?.telefone ?? '');
  const [regTipo, setRegTipo] = useState<RegistroProfissionalTipo | null>(
    d0?.regTipo ?? null,
  );
  const [regNumero, setRegNumero] = useState(d0?.regNumero ?? '');
  const [municipiosSel, setMunicipiosSel] = useState<string[]>(
    d0?.municipiosSel ?? [],
  );
  // Conta criada pelo Google (T-126) nasce sem UF — aqui ela é escolhida. Quem
  // veio do cadastro local já tem a UF e só a vê (read-only, como antes).
  const [ufSel, setUfSel] = useState<string | null>(d0?.ufSel ?? null);

  const ufCadastrada = user?.uf ?? null;
  const uf = ufCadastrada ?? ufSel ?? '';
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

  // O que já está no cofre — mostrado no passo 2 para o usuário ver o que
  // acabou de cadastrar sem precisar ir até a página de Documentos.
  const docs = useMemo(() => {
    if (perfilState.status !== 'success') return [];
    const { certidoes, atestados } = perfilState.data;
    return [
      ...certidoes.map((c) => ({
        key: `c-${c.id}`,
        nome:
          c.tipo === 'OUTRA' && c.descricao
            ? c.descricao
            : CERTIDAO_TIPO_LABELS[c.tipo],
        detalhe: `${validadeLabel(c.dataValidade)} · ${c.arquivo ? 'PDF anexado' : 'sem PDF'}`,
      })),
      ...atestados.map((a) => ({
        key: `a-${a.id}`,
        nome: a.descricao,
        detalhe: `${a.contratante ?? 'Contratante não informado'} · ${a.arquivo ? 'CAT anexada' : 'sem CAT'}`,
      })),
    ];
  }, [perfilState]);

  // Prefill do formulário — só no primeiro snapshot: os reloads seguintes (após
  // cadastrar um documento) não podem sobrescrever o que o usuário digitou.
  // Se veio de um rascunho (T-167), já nasce "preenchido": o rascunho é mais
  // recente que o backend e não pode ser sobrescrito por ele.
  const prefilled = useRef(veioDeRascunho.current);
  useEffect(() => {
    if (prefilled.current || perfilState.status !== 'success') return;
    prefilled.current = true;
    const p = perfilState.data.profile;
    if (!p) return;
    setRazaoSocial(p.razaoSocial ?? '');
    setCapitalSocial(p.capitalSocial ?? '');
    setPatrimonioLiquido(p.patrimonioLiquido ?? '');
    setTelefone(p.telefone ?? '');
    setRegTipo(p.registroProfissionalTipo);
    setRegNumero(p.registroProfissionalNumero ?? '');
  }, [perfilState]);

  // Semeia os municípios já preferidos quando o usuário chega no contexto.
  // Pulado quando veio de rascunho (T-167): o rascunho já tem a seleção do
  // usuário e o `user` async sobrescreveria o que ele tinha escolhido.
  useEffect(() => {
    if (veioDeRascunho.current) return;
    setMunicipiosSel((user?.municipios ?? []).map((m) => m.codigoIbge));
  }, [user]);

  // Persiste o rascunho a cada mudança (T-167). É o que sobrevive ao F5.
  useEffect(() => {
    saveOnboardingDraft({
      active,
      razaoSocial,
      capitalSocial,
      patrimonioLiquido,
      telefone,
      regTipo,
      regNumero,
      municipiosSel,
      ufSel,
    });
  }, [
    active,
    razaoSocial,
    capitalSocial,
    patrimonioLiquido,
    telefone,
    regTipo,
    regNumero,
    municipiosSel,
    ufSel,
  ]);

  const next = () => setActive((a) => Math.min(LAST_STEP, a + 1));
  const prev = () => setActive((a) => Math.max(0, a - 1));

  async function salvarEmpresa() {
    setErro(null);
    // Sem UF a captação por região (T-18) nunca roda para este usuário: é o único
    // campo que o onboarding não pode deixar passar em branco.
    if (!uf) {
      setErro('Escolha o estado onde você atua.');
      return;
    }
    // T-173: telefone é obrigatório (junto com a UF). Completo, não pela metade.
    if (!telefoneValido(telefone)) {
      setErro(
        telefone.trim()
          ? 'O telefone está incompleto. Informe DDD + número.'
          : 'Informe seu telefone de contato.',
      );
      return;
    }
    setSalvando(true);
    try {
      // A UF precisa existir antes dos municípios (que são validados contra ela).
      if (!ufCadastrada) {
        await updateUf(uf);
      }
      const perfil: CompanyProfileInput = {};
      if (razaoSocial.trim()) perfil.razaoSocial = razaoSocial.trim();
      if (telefone.trim()) perfil.telefone = telefone.trim();
      if (typeof capitalSocial === 'number') perfil.capitalSocial = capitalSocial;
      if (typeof patrimonioLiquido === 'number')
        perfil.patrimonioLiquido = patrimonioLiquido;
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
                      label="Razão social (opcional)"
                      placeholder="Nome da sua empresa"
                      value={razaoSocial}
                      onChange={(e) => setRazaoSocial(e.currentTarget.value)}
                    />
                    <TextInput
                      label="Telefone de contato"
                      placeholder="(00) 00000-0000"
                      // Obrigatório (T-173): junto com a UF, é o que trava o
                      // "Salvar e continuar" enquanto não estiver completo.
                      withAsterisk
                      value={telefone}
                      // T-172: máscara na digitação (descarta letras) + aviso
                      // quando preenchido e incompleto.
                      onChange={(e) =>
                        setTelefone(formatarTelefone(e.currentTarget.value))
                      }
                      error={
                        telefone.trim() && !telefoneValido(telefone)
                          ? 'Telefone incompleto — informe DDD + número.'
                          : undefined
                      }
                      inputMode="tel"
                    />
                  </Group>
                  <Group grow align="flex-start">
                    <NumberInput
                      label="Capital social (opcional)"
                      description="Do contrato social"
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
                    {/* T-141: muitos editais exigem PL mínimo (10% do estimado),
                        não capital social — e são números diferentes. */}
                    <NumberInput
                      label="Patrimônio líquido (opcional)"
                      description="Do último balanço"
                      placeholder="0"
                      value={patrimonioLiquido}
                      onChange={(v) =>
                        setPatrimonioLiquido(typeof v === 'number' ? v : '')
                      }
                      min={0}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                    />
                  </Group>

                  {ufCadastrada ? (
                    <Box>
                      <Text fz={14} fw={500} mb={4}>
                        Sua região
                      </Text>
                      <Text fz="sm" c="dimmed">
                        Cadastrada como <b>{ufName(ufCadastrada)}</b>. As obras vêm
                        desse estado; escolha abaixo os municípios onde você atua.
                      </Text>
                    </Box>
                  ) : (
                    // Conta criada pelo Google (T-126): a UF não veio do cadastro.
                    <Select
                      label="Seu estado"
                      description="As obras vêm desse estado. Dá para refinar por município abaixo."
                      placeholder="Escolha o estado"
                      data={UF_OPTIONS}
                      value={ufSel}
                      onChange={(v) => {
                        setUfSel(v);
                        // Municípios pertencem à UF anterior — limpa para não
                        // enviar código de outro estado.
                        setMunicipiosSel([]);
                      }}
                      searchable
                      required
                    />
                  )}

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
                      label="Conselho do responsável técnico (opcional)"
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
              {docs.length > 0 && (
                <Stack gap="xs" mb="md">
                  {docs.map((d) => (
                    <Card key={d.key} withBorder radius="md" py="sm" px="md">
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon variant="light" color="apto" radius="xl" size={28} style={{ flex: 'none' }}>
                          <IconCheck size={15} />
                        </ThemeIcon>
                        <Box style={{ minWidth: 0 }}>
                          <Text fz={13.5} fw={600} lineClamp={1}>
                            {d.nome}
                          </Text>
                          <Text fz={12} c="dimmed">
                            {d.detalhe}
                          </Text>
                        </Box>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              )}

              <Card radius="lg" p="xl" style={{ border: '2px dashed var(--mantine-color-concreto-5)' }}>
                <Stack align="center" gap={6}>
                  <ThemeIcon variant="light" color="gray" radius="xl" size={44}>
                    <IconUpload size={22} />
                  </ThemeIcon>
                  <Text fz={14} fw={600}>
                    CND, FGTS, CNDT, contrato social, balanço, CAT…
                  </Text>
                  <Text fz={12} c="dimmed" ta="center" maw={360}>
                    Cadastre o documento e anexe o PDF — cada arquivo fica ligado
                    ao tipo de certidão no cofre.
                  </Text>
                  <Group mt="xs" gap="sm">
                    <Button
                      color="orange"
                      leftSection={<IconCertificate size={16} />}
                      onClick={() => setCertidaoModal(true)}
                    >
                      Adicionar certidão
                    </Button>
                    <Button
                      variant="default"
                      leftSection={<IconFileText size={16} />}
                      onClick={() => setAtestadoModal(true)}
                    >
                      Adicionar atestado
                    </Button>
                  </Group>
                </Stack>
              </Card>
              <Text fz={12.5} c="dimmed" mt="sm">
                Sem pressa: você pode {docs.length > 0 ? 'continuar' : 'pular'} e
                enviar o resto depois, em Documentos.
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
              <Button
                color="orange"
                onClick={salvarEmpresa}
                loading={salvando}
                // T-173: só avança com os obrigatórios (UF + telefone completo)
                // preenchidos. O salvarEmpresa mantém a checagem como defesa.
                disabled={!uf || !telefoneValido(telefone)}
              >
                Salvar e continuar
              </Button>
            )}
            {active === 1 && (
              <Button color="orange" onClick={next}>
                {docs.length > 0 ? 'Continuar' : 'Pular por enquanto'}
              </Button>
            )}
            {active === LAST_STEP && (
              <Button
                color="orange"
                onClick={() => {
                  // Onboarding concluído: o backend já é a fonte da verdade,
                  // o rascunho não é mais necessário (T-167 / LGPD).
                  clearOnboardingDraft();
                  navigate('/');
                }}
              >
                Ir para o início
              </Button>
            )}
          </Group>
        </Box>
      </Box>

      {/* mesmos modais do cofre (DocumentosPage): cadastrar + anexar o PDF sem
          sair do onboarding. */}
      <CertidaoFormModal
        opened={certidaoModal}
        certidao={null}
        onClose={() => setCertidaoModal(false)}
        onSaved={reloadPerfil}
      />
      <AtestadoFormModal
        opened={atestadoModal}
        atestado={null}
        onClose={() => setAtestadoModal(false)}
        onSaved={reloadPerfil}
      />
    </Group>
  );
}
