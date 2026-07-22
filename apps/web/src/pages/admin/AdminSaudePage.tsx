import {
  Alert,
  Badge,
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
import { IconCheck, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { getAdminSaude } from '../../lib/api';
import type { EnvStatus, SaudeIntegracoes } from '../../types/admin';

// Agrupa os envs por grupo, preservando a ordem de aparição.
function porGrupo(envs: EnvStatus[]): [string, EnvStatus[]][] {
  const mapa = new Map<string, EnvStatus[]>();
  for (const e of envs) {
    const lista = mapa.get(e.grupo) ?? [];
    lista.push(e);
    mapa.set(e.grupo, lista);
  }
  return [...mapa.entries()];
}

// Saúde das integrações + sanidade de env (T-201). Desarma a armadilha do §8/
// T-163 (reprovisionamento que sobe "verde e morto"). Só nomes + presença.
export function AdminSaudePage() {
  const [saude, setSaude] = useState<SaudeIntegracoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    getAdminSaude()
      .then((r) => ativo && setSaude(r))
      .catch((e: unknown) => ativo && setErro((e as Error).message));
    return () => {
      ativo = false;
    };
  }, []);

  if (erro) {
    return (
      <Alert color="red" title="Falha ao carregar a saúde">
        {erro}
      </Alert>
    );
  }
  if (!saude) {
    return (
      <Center py="xl">
        <Loader color="orange" />
      </Center>
    );
  }

  return (
    <Stack>
      <div>
        <Group gap="xs">
          <Title order={2}>Saúde</Title>
          <Badge color={saude.producao ? 'blue' : 'gray'} variant="light">
            {saude.producao ? 'produção' : 'dev'}
          </Badge>
        </Group>
        <Text c="dimmed">
          Integrações configuradas e envs presentes × esperadas. Só presença —
          nunca o valor de um segredo.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {saude.integracoes.map((i) => (
          <Card key={i.nome} withBorder padding="sm">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Group gap="xs">
                  <Text fw={600}>{i.nome}</Text>
                  {i.obrigatorio && (
                    <Badge size="xs" color="gray" variant="light">
                      obrigatório
                    </Badge>
                  )}
                </Group>
                {!i.configurado && (
                  <Text size="xs" c="dimmed">
                    {i.degrada}
                  </Text>
                )}
              </div>
              <Badge
                color={
                  i.configurado ? 'green' : i.obrigatorio ? 'red' : 'yellow'
                }
                leftSection={
                  i.configurado ? <IconCheck size={12} /> : <IconX size={12} />
                }
              >
                {i.configurado ? 'ok' : 'ausente'}
              </Badge>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        "Configurado" = env presente. Checagem "respondendo ao vivo" fica para
        uma próxima entrega (pingar provedores a cada carga custa chamada).
      </Text>

      <Card withBorder>
        <Title order={4} mb="sm">
          Variáveis de ambiente
        </Title>
        <Stack gap="md">
          {porGrupo(saude.envs).map(([grupo, envs]) => (
            <div key={grupo}>
              <Text size="sm" fw={600} c="dimmed" mb={4}>
                {grupo}
              </Text>
              <Table>
                <Table.Tbody>
                  {envs.map((e) => (
                    <Table.Tr key={e.nome}>
                      <Table.Td>
                        <Text size="sm" ff="monospace">
                          {e.nome}
                        </Text>
                      </Table.Td>
                      <Table.Td w={120}>
                        {e.obrigatorioEmProd && (
                          <Badge size="xs" color="gray" variant="light">
                            prod
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td w={110} ta="right">
                        <Badge
                          color={
                            e.presente
                              ? 'green'
                              : e.obrigatorioEmProd
                                ? 'red'
                                : 'gray'
                          }
                          variant="light"
                        >
                          {e.presente ? 'presente' : 'ausente'}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
