import { Badge, Card, Container, Group, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { API_URL, apiGet } from '../lib/api';

interface HealthResponse {
  status: string;
}

type ConnState =
  | { kind: 'loading' }
  | { kind: 'ok'; status: string }
  | { kind: 'error'; message: string };

/**
 * Página inicial provisória (T-25): prova que o frontend conversa com o backend
 * batendo no /health. A tela de busca de editais é a T-26.
 */
export function HomePage() {
  const [conn, setConn] = useState<ConnState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    apiGet<HealthResponse>('/health')
      .then((data) => {
        if (active) setConn({ kind: 'ok', status: data.status });
      })
      .catch((err: Error) => {
        if (active) setConn({ kind: 'error', message: err.message });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <div>
          <Title order={1}>ObraPub</Title>
          <Text c="dimmed">Captação e busca de editais de obra pública</Text>
        </div>

        <Card withBorder padding="lg" radius="md">
          <Group justify="space-between">
            <Text fw={500}>Backend</Text>
            {conn.kind === 'loading' && <Badge color="gray">verificando…</Badge>}
            {conn.kind === 'ok' && (
              <Badge color="green">conectado ({conn.status})</Badge>
            )}
            {conn.kind === 'error' && <Badge color="red">offline</Badge>}
          </Group>
          <Text size="sm" c="dimmed" mt="sm">
            {API_URL}
          </Text>
          {conn.kind === 'error' && (
            <Text size="sm" c="red" mt="xs">
              {conn.message}
            </Text>
          )}
        </Card>
      </Stack>
    </Container>
  );
}
