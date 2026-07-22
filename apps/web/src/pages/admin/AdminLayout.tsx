import { Anchor, Box, Container, Group, NavLink, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconShieldLock } from '@tabler/icons-react';
import { Link, Outlet, useLocation } from 'react-router-dom';

// Seções do backoffice. Cresce conforme T-184+ (contas, captação, IA, billing).
const SECOES = [
  { rotulo: 'Início', to: '/admin', exact: true },
  { rotulo: 'Contas', to: '/admin/contas', exact: false },
  { rotulo: 'Captação', to: '/admin/captacao', exact: false },
  { rotulo: 'Buscas', to: '/admin/buscas', exact: false },
  { rotulo: 'Saídas de IA', to: '/admin/ia', exact: false },
  { rotulo: 'Saúde', to: '/admin/saude', exact: false },
  { rotulo: 'Auditoria', to: '/admin/auditoria', exact: false },
];

// Layout próprio da área /admin (T-181) — deliberadamente distinto do AppLayout
// do produto: o backoffice não é o app do empreiteiro. Enxuto por ora; ganha
// navegação lateral quando as áreas (contas, captação, IA, billing) entrarem.
export function AdminLayout() {
  const { pathname } = useLocation();
  const ativa = (to: string, exact: boolean) =>
    exact ? pathname === to : pathname.startsWith(to);

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
        <Group align="flex-start" wrap="nowrap" gap="xl">
          <Box component="nav" w={180} style={{ flexShrink: 0 }}>
            {SECOES.map((s) => (
              <NavLink
                key={s.to}
                component={Link}
                to={s.to}
                label={s.rotulo}
                active={ativa(s.to, s.exact)}
              />
            ))}
          </Box>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Outlet />
          </Box>
        </Group>
      </Container>
    </Box>
  );
}
