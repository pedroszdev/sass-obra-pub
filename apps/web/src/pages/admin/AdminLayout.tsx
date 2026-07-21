import { Anchor, Box, Container, Group, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconShieldLock } from '@tabler/icons-react';
import { Link, Outlet } from 'react-router-dom';

// Layout próprio da área /admin (T-181) — deliberadamente distinto do AppLayout
// do produto: o backoffice não é o app do empreiteiro. Enxuto por ora; ganha
// navegação lateral quando as áreas (contas, captação, IA, billing) entrarem.
export function AdminLayout() {
  return (
    <Box>
      <Box
        component="header"
        py="sm"
        px="md"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Container size="lg" px={0}>
          <Group justify="space-between">
            <Group gap="xs">
              <IconShieldLock size={20} color="var(--mantine-color-orange-6)" />
              <Title order={4} m={0}>
                Administração
              </Title>
              <Text c="dimmed" size="sm">
                PrumoLicita
              </Text>
            </Group>
            <Anchor component={Link} to="/" size="sm">
              <Group gap={4}>
                <IconArrowLeft size={16} />
                Voltar ao app
              </Group>
            </Anchor>
          </Group>
        </Container>
      </Box>
      <Container size="lg" py="lg">
        <Outlet />
      </Container>
    </Box>
  );
}
