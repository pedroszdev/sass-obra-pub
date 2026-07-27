import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  MultiSelect,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { UFS } from '../../data/ufs';
import {
  getAdminCaptacao,
  rodarCaptacao,
  rodarNotificacoes,
} from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { PainelCaptacao } from '../../types/admin';

function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

// Painel de captação e jobs (T-188). Numa olhada: a captação e os alertas estão
// saudáveis? Os disparos são assíncronos (o resultado aparece nas execuções).
export function AdminCaptacaoPage() {
  const [painel, setPainel] = useState<PainelCaptacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ufs, setUfs] = useState<string[]>([]);
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

  async function dispararCaptacao() {
    setOcupado('captacao');
    setAviso(null);
    try {
      const r = await rodarCaptacao(ufs);
      const alvo =
        ufs.length > 0
          ? `UF(s): ${ufs.join(', ')}`
          : 'UFs com usuário ativo (orientada à demanda)';
      setAviso({
        ok: r.status === 'disparado',
        texto:
          r.status === 'disparado'
            ? `Captação disparada — ${alvo}. Leva alguns minutos; o resultado aparece nas execuções.`
            : 'Captação já está em execução.',
      });
      await carregar();
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  async function dispararNotificacoes() {
    setOcupado('notificacoes');
    setAviso(null);
    try {
      const r = await rodarNotificacoes();
      if (r.status === 'em_execucao') {
        setAviso({ ok: false, texto: 'Notificações já estão em execução.' });
      } else {
        const total =
          r.alertas +
          r.obrasDoDia +
          r.renovacoes +
          r.trialAcabando +
          r.completePerfil +
          r.dunning;
        const enviados = `enviados: ${r.alertas} urgência, ${r.obrasDoDia} obra do dia, ${r.renovacoes} renovação, ${r.trialAcabando} trial acabando, ${r.completePerfil} completar perfil, ${r.dunning} pagamento falho`;
        let texto: string;
        if (total > 0) {
          texto = `Concluído — ${enviados}. Confira em E-mails.`;
        } else if (r.usuariosNotificaveis === 0) {
          texto =
            'Concluído — 0 e-mails: nenhuma conta elegível (precisa de e-mail verificado + aviso de e-mail ligado). Verifique uma conta e ligue o toggle.';
        } else {
          texto = `Concluído — 0 e-mails. ${r.usuariosNotificaveis} conta(s) elegível(is), mas nada acionável agora: sem certidão vencendo, sem obra APTA nova na região, sem renovação — ou já enviado hoje (não repete).`;
        }
        setAviso({ ok: total > 0, texto });
      }
      await carregar();
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

      <Card withBorder>
        <Title order={4} mb={4}>
          Rodar captação
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Sem escolher UF, capta as UFs com usuário ativo (orientada à demanda).
          Escolha UFs para captar uma região específica — útil para pré-aquecer
          uma região antes de ter usuário lá.
        </Text>
        <Group align="flex-end" gap="sm">
          <MultiSelect
            label="UFs (opcional)"
            placeholder="todas com usuário ativo"
            data={UFS.map((u) => ({ value: u.code, label: u.name }))}
            value={ufs}
            onChange={setUfs}
            searchable
            clearable
            style={{ flex: 1, minWidth: 240 }}
          />
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            loading={ocupado === 'captacao'}
            onClick={() => void dispararCaptacao()}
          >
            Rodar captação
          </Button>
        </Group>
      </Card>

      <Card withBorder>
        <Title order={4} mb={4}>
          Rodar notificações
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Dispara os e-mails do dia: resumo de urgência (certidão vencendo + prazo
          próximo) e a "melhor obra pra você hoje". Só alcança quem tem e-mail
          verificado e o aviso ligado — o resultado mostra quantos saíram.
        </Text>
        <Button
          variant="light"
          leftSection={<IconPlayerPlay size={16} />}
          loading={ocupado === 'notificacoes'}
          onClick={() => void dispararNotificacoes()}
        >
          Rodar notificações
        </Button>
      </Card>

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
