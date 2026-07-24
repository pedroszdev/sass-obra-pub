import { Box, Button, Group, Text } from '@mantine/core';
import { IconEyeExclamation } from '@tabler/icons-react';
import { useState } from 'react';
import { pararImpersonation } from '../lib/api';
import type { UserMe } from '../types/auth';

// Banner permanente do modo suporte (T-187). Enquanto o admin "vê como" um
// cliente, TODA mutação é bloqueada pelo backend (só leitura) — este banner é o
// aviso constante de que a sessão não é a do admin. "Sair" limpa o cookie de
// impersonação e recarrega: a sessão do admin (intacta por baixo) reassume, sem
// re-login, e volta para o detalhe da conta.
export function ImpersonationBanner({ user }: { user: UserMe }) {
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await pararImpersonation();
    // `user.id` é o ALVO (a sessão responde como ele). Recarrega de verdade para
    // reidratar o estado inteiro a partir do cookie do admin.
    window.location.href = `/admin/contas/${user.id}`;
  }

  return (
    <Box
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        background: 'var(--mantine-color-orange-6)',
        color: '#fff',
      }}
      px="lg"
      py={8}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap">
          <IconEyeExclamation size={18} />
          <Text size="sm" fw={600}>
            Modo suporte — vendo como {user.name} ({user.email}). Somente
            leitura.
          </Text>
        </Group>
        <Button
          size="xs"
          variant="white"
          color="orange"
          loading={saindo}
          onClick={sair}
        >
          Sair do modo suporte
        </Button>
      </Group>
    </Box>
  );
}
