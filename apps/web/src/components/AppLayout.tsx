import {
  ActionIcon,
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
  IconBell,
  IconCalendar,
  IconFileSpreadsheet,
  IconFileText,
  IconLayoutGrid,
  IconLogout,
  IconMapPin,
  IconSearch,
  IconStar,
  IconUser,
} from '@tabler/icons-react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  /** Prefixo de rota que mantém o item ativo (ex.: detalhe do edital). */
  prefix: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: IconLayoutGrid, prefix: '/' },
  { to: '/editais', label: 'Buscar editais', icon: IconSearch, prefix: '/editais' },
  { to: '/salvos', label: 'Salvas', icon: IconStar, prefix: '/salvos' },
  { to: '/orcamentos', label: 'Orçamentos', icon: IconFileSpreadsheet, prefix: '/orcamentos' },
  { to: '/documentos', label: 'Documentos', icon: IconFileText, prefix: '/documentos' },
  { to: '/agenda', label: 'Agenda', icon: IconCalendar, prefix: '/agenda' },
  { to: '/alertas', label: 'Alertas', icon: IconBell, prefix: '/alertas' },
  { to: '/perfil', label: 'Perfil', icon: IconUser, prefix: '/perfil' },
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
  if (pathname.startsWith('/salvos')) return 'Editais salvos';
  if (pathname.startsWith('/orcamentos')) {
    return pathname === '/orcamentos' ? 'Orçamentos' : 'Orçamento';
  }
  if (pathname.startsWith('/documentos')) return 'Documentos e habilitação';
  if (pathname.startsWith('/agenda')) return 'Agenda de prazos';
  if (pathname.startsWith('/alertas')) return 'Alertas';
  if (pathname.startsWith('/perfil')) return 'Perfil da empresa';
  if (pathname.startsWith('/onboarding')) return 'Primeiros passos';
  return 'PrumoLicita';
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
            <Text fz={17} fw={700} ff="heading">
              {sectionTitle(location.pathname)}
            </Text>
          </Group>

          <Group gap="md">
            {user?.uf && (
              <Group gap={5} visibleFrom="xs">
                <IconMapPin size={15} color="var(--mantine-color-gray-6)" />
                <Text fz="sm" c="dimmed">
                  {user.uf}
                </Text>
              </Group>
            )}
            <ActionIcon
              component={Link}
              to="/alertas"
              variant="subtle"
              color="gray"
              radius="xl"
              size="lg"
              aria-label="Alertas"
            >
              <IconBell size={19} stroke={1.7} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="12px" bg="graphite.9">
        <Group px={8} pt={10} pb={18}>
          <Logo size={26} variant="onDark" />
        </Group>

        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={3} className="nav-dark">
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
                  color="orange"
                  leftSection={<ItemIcon size={18} stroke={1.7} />}
                />
              );
            })}
          </Stack>
        </AppShell.Section>

        <AppShell.Section>
          <Menu width={210} position="right-end" withinPortal>
            <Menu.Target>
              <UnstyledButton
                style={{
                  display: 'block',
                  width: '100%',
                  borderTop: '1px solid var(--mantine-color-graphite-7)',
                  paddingTop: 12,
                }}
              >
                <Group gap="sm" wrap="nowrap">
                  <Avatar color="orange" variant="filled" radius="xl" size={34}>
                    {initials(userName)}
                  </Avatar>
                  <Box style={{ minWidth: 0 }}>
                    <Text fz={12.5} fw={700} c="concreto.2" lineClamp={1}>
                      {userName}
                    </Text>
                    <Text fz={11} c="concreto.6">
                      {porteUf || 'Empresa'}
                    </Text>
                  </Box>
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconUser size={16} />}
                component={Link}
                to="/perfil"
                onClick={close}
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
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          background: 'var(--mantine-color-concreto-2)',
        }}
      >
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
