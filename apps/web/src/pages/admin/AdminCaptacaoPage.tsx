import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import {
  getAdminCaptacao,
  rodarCaptacao,
  rodarNotificacoes,
} from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { DisparoResposta, PainelCaptacao } from '../../types/admin';

function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

// Painel de captação e jobs (T-188). Numa olhada: a captação e os alertas estão
// saudáveis? Os disparos são assíncronos (o resultado aparece nas execuções).
export function AdminCaptacaoPage() {
  const [painel, setPainel] = useState<PainelCaptacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setPainel(await getAdminCaptacao());
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function disparar(
    chave: string,
    fn: () => Promise<DisparoResposta>,
    nome: string,
  ) {
    setOcupado(chave);
    setAviso(null);
    try {
      const r = await fn();
      setAviso({
        ok: r.status === 'disparado',
        texto:
          r.status === 'disparado'
            ? `${nome} disparada. O resultado aparece nas execuções em instantes.`
            : `${nome} já está em execução.`,
      });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  if (erro) {
    return (
      <Alert color="red" title="Falha ao carregar o painel">
        {erro}
      </Alert>
    );
  }
  if (!painel) {
    return (
      <Center py="xl">
        <Loader color="orange" />
      </Center>
    );
  }

  const { saude, porConector, recentes, alertasPorDia } = painel;

  return (
    <Stack>
      <div>
        <Title order={2}>Captação e jobs</Title>
        <Text c="dimmed">A captação e a entrega de alertas estão saudáveis?</Text>
      </div>

      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Group gap="xs">
              <Text fw={600}>Saúde da captação</Text>
              <Badge color={saude.saudavel ? 'green' : 'red'}>
                {saude.saudavel ? 'saudável' : 'atenção'}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              {saude.ultimoSucessoEm
                ? `Último sucesso ${fmtDateTime(saude.ultimoSucessoEm)} (há ${saude.horasDesde}h)`
                : 'Nenhuma captação bem-sucedida registrada.'}
            </Text>
          </div>
          <Button
            variant="subtle"
            leftSection={<IconRefresh size={16} />}
            onClick={() => void carregar()}
          >
            Atualizar
          </Button>
        </Group>
      </Card>

      {aviso && (
        <Alert color={aviso.ok ? 'green' : 'yellow'}>{aviso.texto}</Alert>
      )}

      <Group>
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          loading={ocupado === 'captacao'}
          onClick={() =>
            disparar('captacao', rodarCaptacao, 'Captação').then(() =>
              carregar(),
            )
          }
        >
          Rodar captação
        </Button>
        <Button
          variant="light"
          leftSection={<IconPlayerPlay size={16} />}
          loading={ocupado === 'notificacoes'}
          onClick={() =>
            disparar('notificacoes', rodarNotificacoes, 'Notificações')
          }
        >
          Rodar notificações
        </Button>
      </Group>

      <Card withBorder>
        <Title order={4} mb="sm">
          Por conector
        </Title>
        {porConector.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nenhuma execução registrada.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {porConector.map((r) => (
              <Group key={r.fonte} justify="space-between">
                <div>
                  <Text fw={600}>{r.fonte}</Text>
                  <Text size="xs" c="dimmed">
                    {fmtDateTime(r.startedAt)}
                  </Text>
                </div>
                <Badge color={r.status === 'success' ? 'green' : 'red'}>
                  {r.status}
                </Badge>
              </Group>
            ))}
          </SimpleGrid>
        )}
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Alertas enviados por dia (7 dias)
        </Title>
        {alertasPorDia.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nenhum alerta enviado no período.
          </Text>
        ) : (
          <Group>
            {alertasPorDia.map((a) => (
              <Card key={a.dia} withBorder padding="xs">
                <Text size="lg" fw={700}>
                  {a.total}
                </Text>
                <Text size="xs" c="dimmed">
                  {a.dia}
                </Text>
              </Card>
            ))}
          </Group>
        )}
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Execuções recentes
        </Title>
        {recentes.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nenhuma execução ainda.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Quando</Table.Th>
                  <Table.Th>Fonte / UF</Table.Th>
                  <Table.Th>Modo</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Proc. / Novos / Obras</Table.Th>
                  <Table.Th>Duração</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recentes.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {fmtDateTime(r.startedAt)}
                    </Table.Td>
                    <Table.Td>
                      {r.fonte} / {r.uf}
                    </Table.Td>
                    <Table.Td>{r.mode}</Table.Td>
                    <Table.Td>
                      <Badge
                        color={r.status === 'success' ? 'green' : 'red'}
                        variant="light"
                      >
                        {r.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {r.processed} / {r.created} / {r.obras}
                    </Table.Td>
                    <Table.Td>{segundos(r.durationMs)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Text size="xs" c="dimmed">
        Disparos manuais rodam em segundo plano, com lock contra execução dupla
        (manual × agendado). Retenção, exclusão de inativos e limpeza de tokens
        têm seus próprios crons — botões dedicados entram numa próxima entrega.
      </Text>
    </Stack>
  );
}
