import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconCheck, IconUpload } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';

// Onboarding mockado (CLAUDE.md §7) — tela cheia de duas colunas do handoff.
const LAST_STEP = 2; // 0 = Sua empresa · 1 = Documentos · 2 = Pronto

const MONO_LABEL = {
  label: {
    fontFamily: 'var(--mantine-font-family-monospace)',
    textTransform: 'uppercase' as const,
    fontSize: '0.7rem',
    letterSpacing: '0.06em',
    color: 'var(--mantine-color-graphite-5)',
    fontWeight: 500,
  },
};

const TIPOS_OBRA = [
  'Reforma predial',
  'Pavimentação',
  'Saneamento',
  'Edificações',
  'Drenagem',
];

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
  const [active, setActive] = useState(0);
  const [tipos, setTipos] = useState<string[]>(['Reforma predial', 'Pavimentação']);
  const navigate = useNavigate();

  const next = () => setActive((a) => Math.min(LAST_STEP, a + 1));
  const prev = () => setActive((a) => Math.max(0, a - 1));
  const toggleTipo = (t: string) =>
    setTipos((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

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
            Leva 3 minutos. É com isso que a gente acha as obras certas pra você.
          </Text>

          <Stack gap="lg" mt={40}>
            <StepItem n={1} title="Conta criada" sub="Acesso confirmado" state="done" />
            <StepItem
              n={2}
              title="Sua empresa"
              sub="CNPJ, região e tipo de obra"
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
          Precisa de ajuda? Chama no WhatsApp.
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

          {active === 0 && (
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
                    label="CNPJ"
                    defaultValue="12.345.678/0001-90"
                    styles={MONO_LABEL}
                    rightSection={<IconCheck size={16} color="var(--mantine-color-apto-7)" />}
                  />
                  <TextInput
                    label="Capital social"
                    defaultValue="R$ 320.000"
                    styles={MONO_LABEL}
                  />
                </Group>

                <Box>
                  <Text className="brand-label" mb={8}>
                    Onde você pega obra
                  </Text>
                  <Group gap="xs">
                    <Badge size="lg" radius="xl" color="graphite" variant="filled" tt="none" rightSection="×">
                      Guarulhos
                    </Badge>
                    <Badge size="lg" radius="xl" color="graphite" variant="filled" tt="none" rightSection="×">
                      São Paulo
                    </Badge>
                    <Badge size="lg" radius="xl" variant="default" tt="none" style={{ cursor: 'pointer' }}>
                      + adicionar cidade
                    </Badge>
                  </Group>
                </Box>

                <Box>
                  <Text className="brand-label" mb={8}>
                    Tipo de obra que você faz
                  </Text>
                  <Group gap="xs">
                    {TIPOS_OBRA.map((t) => {
                      const on = tipos.includes(t);
                      return (
                        <Badge
                          key={t}
                          size="lg"
                          radius="xl"
                          tt="none"
                          color={on ? 'orange' : 'gray'}
                          variant={on ? 'filled' : 'default'}
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleTipo(t)}
                        >
                          {t}
                        </Badge>
                      );
                    })}
                  </Group>
                </Box>

                <Group grow align="flex-start">
                  <Select
                    label="Faixa de valor que você toca"
                    defaultValue="3mi"
                    styles={MONO_LABEL}
                    data={[
                      { value: '80k', label: 'Até R$ 80 mil (ME/EPP)' },
                      { value: '500k', label: 'Até R$ 500 mil' },
                      { value: '3mi', label: 'Até R$ 3 milhões' },
                      { value: 'mais', label: 'Acima de R$ 3 milhões' },
                    ]}
                  />
                  <TextInput
                    label="Responsável técnico (CREA)"
                    defaultValue="Sérgio Tavares · 0987654"
                    styles={MONO_LABEL}
                  />
                </Group>
              </Stack>
            </Box>
          )}

          {active === 1 && (
            <Box>
              <Title order={2} fz={26} style={{ letterSpacing: '-0.01em' }}>
                Documentos de habilitação
              </Title>
              <Text fz="sm" c="dimmed" mt={2} mb="xl">
                Envie suas certidões e documentos. Eles ficam no cofre e são
                reaproveitados em cada edital.
              </Text>
              <Card radius="lg" p="xl" style={{ border: '2px dashed var(--mantine-color-concreto-5)' }}>
                <Stack align="center" gap={6}>
                  <ThemeIcon variant="light" color="gray" radius="xl" size={44}>
                    <IconUpload size={22} />
                  </ThemeIcon>
                  <Text fz={14} fw={600}>
                    Arraste seus documentos aqui
                  </Text>
                  <Text fz={12} c="dimmed">
                    CND, FGTS, CNDT, contrato social, balanço, CAT…
                  </Text>
                  <Button mt="xs" color="orange">
                    Selecionar arquivos
                  </Button>
                </Stack>
              </Card>
              <Text fz={12.5} c="dimmed" mt="sm">
                Você pode pular esta etapa e enviar depois, em Documentos.
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
            {active > 0 && active < LAST_STEP ? (
              <Button variant="subtle" color="gray" onClick={prev}>
                ‹ Voltar
              </Button>
            ) : (
              <div />
            )}
            {active === 0 && (
              <Button color="orange" onClick={next}>
                Continuar para documentos
              </Button>
            )}
            {active === 1 && (
              <Button color="orange" onClick={next}>
                Concluir
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
