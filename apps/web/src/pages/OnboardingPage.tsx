import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Stepper,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { IconCheck, IconUpload } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const LAST_STEP = 3;

export function OnboardingPage() {
  const [active, setActive] = useState(0);
  const navigate = useNavigate();

  const next = () => setActive((a) => Math.min(LAST_STEP, a + 1));
  const prev = () => setActive((a) => Math.max(0, a - 1));

  return (
    <Box style={{ flex: 1 }} px="xl" py="xl" pb={44}>
      <Box maw={640} mx="auto">
        <Stepper active={active} onStepClick={setActive} color="orange" size="sm" mb="xl">
          <Stepper.Step label="Empresa" />
          <Stepper.Step label="Documentos" />
          <Stepper.Step label="Região" />
          <Stepper.Step label="Pronto" />
        </Stepper>

        <Card withBorder radius="lg" p="xl">
          {active === 0 && (
            <Box>
              <Text fz={19} fw={700} mb={4}>
                Dados da sua empresa
              </Text>
              <Text fz={13.5} c="dimmed" mb="lg">
                Informe o CNPJ e os dados básicos. Usamos isso para avaliar sua prontidão nas licitações.
              </Text>
              <Stack gap="md">
                <TextInput label="CNPJ" defaultValue="12.345.678/0001-90" />
                <TextInput label="Razão social" defaultValue="Construtora Horizonte Ltda." />
                <Group grow>
                  <Select
                    label="Porte"
                    defaultValue="ME"
                    data={[
                      { value: 'ME', label: 'ME (Microempresa)' },
                      { value: 'EPP', label: 'EPP (Pequeno porte)' },
                      { value: 'DEMAIS', label: 'Demais' },
                    ]}
                  />
                  <Select
                    label="UF"
                    defaultValue="SC"
                    data={['SC', 'PR', 'RS', 'SP', 'MG']}
                  />
                </Group>
              </Stack>
            </Box>
          )}

          {active === 1 && (
            <Box>
              <Text fz={19} fw={700} mb={4}>
                Documentos de habilitação
              </Text>
              <Text fz={13.5} c="dimmed" mb="lg">
                Envie suas certidões e documentos. Eles ficam no cofre e são reaproveitados em cada edital.
              </Text>
              <Card
                radius="md"
                p="xl"
                mb="sm"
                style={{ border: '2px dashed var(--mantine-color-gray-4)' }}
              >
                <Stack align="center" gap={6}>
                  <ThemeIcon variant="light" color="gray" radius="xl" size={40}>
                    <IconUpload size={20} />
                  </ThemeIcon>
                  <Text fz={14} fw={600} c="gray.7">
                    Arraste seus documentos aqui
                  </Text>
                  <Text fz={12} c="gray.5">
                    CND, FGTS, CNDT, contrato social, balanço, CAT…
                  </Text>
                  <Button mt="xs" size="sm">
                    Selecionar arquivos
                  </Button>
                </Stack>
              </Card>
              <Text fz={12.5} c="dimmed">
                Você pode pular esta etapa e enviar depois, em Documentos.
              </Text>
            </Box>
          )}

          {active === 2 && (
            <Box>
              <Text fz={19} fw={700} mb={4}>
                Onde você quer atuar?
              </Text>
              <Text fz={13.5} c="dimmed" mb="lg">
                Selecione as regiões de interesse. Usamos isso para destacar editais perto de você.
              </Text>
              <Group gap="xs">
                <Badge size="lg" radius="xl" color="orange" variant="light" tt="none">
                  Santa Catarina ✓
                </Badge>
                <Badge size="lg" radius="xl" color="orange" variant="light" tt="none">
                  Grande Florianópolis ✓
                </Badge>
                <Badge size="lg" radius="xl" variant="default" tt="none">
                  + Paraná
                </Badge>
                <Badge size="lg" radius="xl" variant="default" tt="none">
                  + Rio Grande do Sul
                </Badge>
              </Group>
            </Box>
          )}

          {active === 3 && (
            <Stack align="center" gap="xs" py="md">
              <ThemeIcon color="green" variant="light" radius="xl" size={64}>
                <IconCheck size={30} />
              </ThemeIcon>
              <Text fz={21} fw={700}>
                Tudo pronto!
              </Text>
              <Text fz={14} c="dimmed" ta="center" maw={400} style={{ lineHeight: 1.5 }}>
                Seu perfil está configurado. Já encontramos editais de obra pública na sua região
                esperando por você.
              </Text>
            </Stack>
          )}

          <Group justify="space-between" mt="xl">
            {active > 0 ? (
              <Button variant="default" onClick={prev}>
                Voltar
              </Button>
            ) : (
              <div />
            )}
            {active < LAST_STEP ? (
              <Button onClick={next}>{active === 2 ? 'Concluir' : 'Continuar'}</Button>
            ) : (
              <Button onClick={() => navigate('/')}>Ir para o início</Button>
            )}
          </Group>
        </Card>
      </Box>
    </Box>
  );
}
