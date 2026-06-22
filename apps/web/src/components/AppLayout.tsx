import {
  AppShell,
  Avatar,
  Box,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  Icon,
  IconCalendar,
  IconChevronDown,
  IconFileSpreadsheet,
  IconFileText,
  IconLayoutGrid,
  IconLogout,
  IconSearch,
  IconUser,
} from '@tabler/icons-react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '../context/auth-context';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  /** Prefixo de rota que mantém o item ativo (ex.: detalhe do edital). */
  prefix: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: IconLayoutGrid, prefix: '/' },
  { to: '/editais', label: 'Editais', icon: IconSearch, prefix: '/editais' },
  { to: '/orcamentos', label: 'Orçamentos', icon: IconFileSpreadsheet, prefix: '/orcamentos' },
  { to: '/documentos', label: 'Documentos', icon: IconFileText, prefix: '/documentos' },
  { to: '/agenda', label: 'Agenda', icon: IconCalendar, prefix: '/agenda' },
  { to: '/perfil', label: 'Perfil da empresa', icon: IconUser, prefix: '/perfil' },
];

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.prefix === '/') return pathname === '/';
  return pathname === item.prefix || pathname.startsWith(`${item.prefix}/`);
}

function sectionTitle(pathname: string): string {
  if (pathname === '/') return 'Início';
  if (pathname.startsWith('/editais')) {
    return pathname === '/editais' ? 'Buscar editais' : 'Detalhe do edital';
  }
  if (pathname.startsWith('/orcamentos')) {
    return pathname === '/orcamentos' ? 'Orçamentos' : 'Orçamento';
  }
  if (pathname.startsWith('/documentos')) return 'Documentos e habilitação';
  if (pathname.startsWith('/agenda')) return 'Agenda de prazos';
  if (pathname.startsWith('/perfil')) return 'Perfil da empresa';
  if (pathname.startsWith('/onboarding')) return 'Primeiros passos';
  return 'ObraPública';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const userName = user?.name ?? 'Minha empresa';
  const porteUf = [user?.porte ? `Porte ${user.porte}` : null, user?.uf]
    .filter(Boolean)
    .join(' · ');

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <AppShell
      layout="alt"
      header={{ height: 60 }}
      navbar={{ width: 236, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fz={17} fw={700}>
              {sectionTitle(location.pathname)}
            </Text>
          </Group>

          <Menu width={210} position="bottom-end" withinPortal>
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar color="blue" radius="xl" size={32}>
                    {initials(userName)}
                  </Avatar>
                  <Box visibleFrom="sm" style={{ lineHeight: 1.1 }}>
                    <Text fz="sm" fw={600} lineClamp={1}>
                      {userName}
                    </Text>
                    {user?.email && (
                      <Text fz={11} c="dimmed" lineClamp={1}>
                        {user.email}
                      </Text>
                    )}
                  </Box>
                  <IconChevronDown size={15} color="var(--mantine-color-gray-6)" />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconUser size={16} />}
                component={Link}
                to="/perfil"
              >
                Perfil da empresa
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={16} />}
                onClick={handleLogout}
              >
                Sair
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="12px">
        <Group gap={11} px={8} pt={6} pb={18}>
          <Box
            w={32}
            h={32}
            bg="orange.8"
            style={{
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text c="white" fw={800} fz={13}>
              OP
            </Text>
          </Box>
          <Box style={{ lineHeight: 1.15 }}>
            <Text fz="sm" fw={700}>
              ObraPública
            </Text>
            <Text fz={10.5} c="gray.5">
              Editais &amp; propostas
            </Text>
          </Box>
        </Group>

        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={3}>
            {NAV_ITEMS.map((item) => {
              const ItemIcon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  component={Link}
                  to={item.to}
                  label={item.label}
                  active={isItemActive(location.pathname, item)}
                  onClick={close}
                  variant="light"
                  color="orange"
                  leftSection={<ItemIcon size={18} stroke={1.7} />}
                  style={{ borderRadius: 8, fontWeight: 600 }}
                />
              );
            })}
          </Stack>
        </AppShell.Section>

        <AppShell.Section>
          <UnstyledButton
            component={Link}
            to="/perfil"
            onClick={close}
            style={{
              display: 'block',
              borderTop: '1px solid var(--mantine-color-gray-1)',
              paddingTop: 12,
            }}
          >
            <Group gap="sm" wrap="nowrap">
              <Avatar color="blue" radius="xl" size={34}>
                {initials(userName)}
              </Avatar>
              <Box style={{ minWidth: 0 }}>
                <Text fz={12.5} fw={700} lineClamp={1}>
                  {userName}
                </Text>
                <Text fz={11} c="dimmed">
                  {porteUf || 'Empresa'}
                </Text>
              </Box>
            </Group>
          </UnstyledButton>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          background: 'var(--mantine-color-gray-0)',
        }}
      >
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
