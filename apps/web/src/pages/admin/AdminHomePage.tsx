import { Alert, Card, Loader, Stack, Text, Title } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

interface AdminMe {
  id: string;
  role: string;
}

// Home do backoffice (T-181) — por ora um esqueleto que PROVA a cadeia ponta a
// ponta: sonda `GET /admin/me` (guardado por AdminGuard no backend, T-180). Se
// responde, o par de guards deixou passar e a área está ligada. Os números do
// negócio (T-194) e as áreas (contas/captação/IA/billing) entram por cima disto.
export function AdminHomePage() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    apiGet<AdminMe>('/admin/me')
      .then((r) => ativo && setMe(r))
      .catch((e: unknown) => ativo && setErro((e as Error).message));
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <Stack>
      <div>
        <Title order={2}>Painel administrativo</Title>
        <Text c="dimmed">
          Área restrita ao dono. As seções (contas, captação, custo de IA,
          billing) entram nas próximas entregas do Épico 15.
        </Text>
      </div>

      <Card withBorder>
        {erro ? (
          <Alert color="red" title="Falha ao confirmar acesso admin">
            {erro}
          </Alert>
        ) : me ? (
          <Alert
            color="green"
            icon={<IconCheck size={18} />}
            title="Acesso admin confirmado"
          >
            Sessão autenticada como <strong>{me.role}</strong> (conta {me.id}).
          </Alert>
        ) : (
          <Loader color="orange" size="sm" />
        )}
      </Card>
    </Stack>
  );
}
