import {
  Avatar,
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPointFilled } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
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
    <Text
      fz={11}
      fw={800}
      c="dimmed"
      tt="uppercase"
      style={{ letterSpacing: 0.6 }}
      mt="xl"
      mb="sm"
    >
      {children}
    </Text>
  );
}

export function PerfilPage() {
  const { user } = useAuth();

  // Identidade vem do usuário logado (real); o resto do perfil ainda é mock.
  const nome = user?.name ?? MOCK_COMPANY.nome;
  const cnpj = user?.cnpj ?? MOCK_COMPANY.cnpj;
  const porte = user?.porte ?? MOCK_COMPANY.porte;
  const uf = user?.uf ?? MOCK_COMPANY.uf;
  const local = `${MOCK_COMPANY.municipio} / ${uf}`;

  return (
    <Box style={{ flex: 1 }} px="xl" py="lg" pb={44}>
      <Box maw={920} mx="auto">
        {/* cabeçalho */}
        <Card withBorder radius="lg" p="xl">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Group gap="md" wrap="nowrap">
              <Avatar color="blue" radius="md" size={60} style={{ flex: 'none' }}>
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
          <Card withBorder radius="md" p="md">
            <Text fz={11} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }} mb={6}>
              Capital social
            </Text>
            <Text fz={18} fw={700}>
              {brl(MOCK_COMPANY.capitalSocial)}
            </Text>
          </Card>
          <Card withBorder radius="md" p="md">
            <Text fz={11} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }} mb={6}>
              Faturamento anual
            </Text>
            <Text fz={18} fw={700}>
              {brl(MOCK_COMPANY.faturamento)}
            </Text>
          </Card>
          <Card withBorder radius="md" p="md">
            <Text fz={11} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }} mb={6}>
              Índice de liquidez
            </Text>
            <Text fz={18} fw={700}>
              {MOCK_COMPANY.liquidez}
            </Text>
          </Card>
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
                  <Text fz={10.5} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>
                    Valor
                  </Text>
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
            <Text fz={11} fw={800} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.6 }} mb="sm">
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
            <Text fz={11} fw={800} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.6 }} mb="sm">
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
    </Box>
  );
}
