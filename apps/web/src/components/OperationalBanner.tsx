import { Box, Group, Text } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { getConfigPublico } from '../lib/api';
import type { BannerNivel, OperationalBanner as Banner } from '../types/admin';

// Cor de fundo por nível (T-195).
const FUNDO: Record<BannerNivel, string> = {
  info: 'var(--mantine-color-blue-6)',
  aviso: 'var(--mantine-color-yellow-7)',
  critico: 'var(--mantine-color-red-7)',
};

// Banner global de aviso (T-195): manutenção/incidente, mostrado a todos. Lê a
// config pública no mount (rota sem auth). Best-effort — uma falha ao buscar não
// atrapalha o app; só não mostra o banner.
export function OperationalBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    getConfigPublico(ac.signal)
      .then((r) => setBanner(r.banner))
      .catch(() => setBanner(null));
    return () => ac.abort();
  }, []);

  if (!banner) return null;

  const Icone = banner.nivel === 'info' ? IconInfoCircle : IconAlertTriangle;

  return (
    <Box
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 210,
        background: FUNDO[banner.nivel],
        color: '#fff',
      }}
      px="lg"
      py={8}
    >
      <Group gap="xs" justify="center" wrap="nowrap">
        <Icone size={18} />
        <Text size="sm" fw={600} ta="center">
          {banner.mensagem}
        </Text>
      </Group>
    </Box>
  );
}
