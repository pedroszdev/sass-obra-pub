import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconExternalLink,
  IconEyeOff,
  IconRefresh,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  curarClassificacao,
  curarRegenerarResumo,
  curarVisibilidade,
  getAdminEdital,
} from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { EditalCuradoria } from '../../types/admin';

function Campo({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase">
        {rotulo}
      </Text>
      <Text size="sm">{valor ?? '—'}</Text>
    </div>
  );
}

// Curadoria de edital (T-197). Sem :id → campo "abrir por id"; com :id → detalhe
// + ações que consertam o dado reportado.
export function AdminCuradoriaPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <IndiceCuradoria />;
  return <DetalheCuradoria id={id} />;
}

function IndiceCuradoria() {
  const navigate = useNavigate();
  const [valor, setValor] = useState('');
  return (
    <Stack>
      <div>
        <Title order={2}>Curadoria de edital</Title>
        <Text c="dimmed">
          Conserta o caso individual reportado ("esse edital tá errado"). Abra
          pelo id do edital.
        </Text>
      </div>
      <Card withBorder>
        <Group align="flex-end">
          <TextInput
            label="Id do edital"
            placeholder="uuid do edital"
            value={valor}
            onChange={(e) => setValor(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            disabled={valor.trim().length < 10}
            onClick={() => navigate(`/admin/editais/${valor.trim()}`)}
          >
            Abrir
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Dica: na aba "Saídas de IA" cada linha tem um atalho "curar".
        </Text>
      </Card>
    </Stack>
  );
}

function DetalheCuradoria({ id }: { id: string }) {
  const [edital, setEdital] = useState<EditalCuradoria | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setEdital(await getAdminEdital(id));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function acao(
    chave: string,
    fn: () => Promise<void>,
    sucesso: string,
    confirmar?: string,
  ) {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(chave);
    setAviso(null);
    try {
      await fn();
      setAviso({ ok: true, texto: sucesso });
      await carregar();
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  if (carregando) {
    return (
      <Center py="xl">
        <Loader color="orange" />
      </Center>
    );
  }
  if (erro || !edital) {
    return (
      <Stack>
        <Anchor component={Link} to="/admin/editais" size="sm">
          <Group gap={4}>
            <IconArrowLeft size={16} />
            Voltar
          </Group>
        </Anchor>
        <Alert color="red" title="Não foi possível carregar o edital">
          {erro ?? 'Edital não encontrado.'}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack>
      <Anchor component={Link} to="/admin/editais" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={16} />
          Voltar
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={3}>{edital.objeto}</Title>
          <Text c="dimmed">
            {edital.municipio} · {edital.uf}
          </Text>
        </div>
        <Anchor
          href={`/editais/${edital.id}`}
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
        >
          <Group gap={4}>
            abrir no app
            <IconExternalLink size={14} />
          </Group>
        </Anchor>
      </Group>

      {aviso && (
        <Alert color={aviso.ok ? 'green' : 'red'}>{aviso.texto}</Alert>
      )}

      <Card withBorder>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Campo
            rotulo="Classificação"
            valor={
              <Badge color={edital.isObra ? 'green' : 'gray'} variant="light">
                {edital.isObra ? 'obra' : 'não-obra'}
              </Badge>
            }
          />
          <Campo
            rotulo="Visibilidade"
            valor={
              <Badge color={edital.oculto ? 'red' : 'green'} variant="light">
                {edital.oculto ? 'oculto' : 'visível'}
              </Badge>
            }
          />
          <Campo rotulo="Situação" valor={edital.situacao ?? '—'} />
          <Campo
            rotulo="Resumo IA"
            valor={
              edital.ia.temResumo
                ? `${edital.ia.status} · ${edital.ia.modelo ?? '—'}`
                : (edital.ia.status ?? 'sem resumo')
            }
          />
        </SimpleGrid>
        {edital.ia.atualizadoEm && (
          <Text size="xs" c="dimmed" mt="xs">
            IA atualizada em {fmtDateTime(edital.ia.atualizadoEm)}
          </Text>
        )}
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Ações
        </Title>
        <Group>
          <Button
            variant="light"
            loading={ocupado === 'classe'}
            onClick={() =>
              acao(
                'classe',
                () => curarClassificacao(edital.id, !edital.isObra),
                edital.isObra
                  ? 'Marcado como não-obra (sai da busca).'
                  : 'Marcado como obra.',
              )
            }
          >
            {edital.isObra ? 'Marcar como não-obra' : 'Marcar como obra'}
          </Button>

          <Button
            variant="light"
            color={edital.oculto ? 'green' : 'red'}
            leftSection={<IconEyeOff size={16} />}
            loading={ocupado === 'vis'}
            onClick={() =>
              acao(
                'vis',
                () => curarVisibilidade(edital.id, !edital.oculto),
                edital.oculto ? 'Reexibido na busca.' : 'Ocultado da busca.',
                edital.oculto
                  ? undefined
                  : 'Ocultar remove o edital da busca (o detalhe por link ainda abre). Confirmar?',
              )
            }
          >
            {edital.oculto ? 'Reexibir na busca' : 'Ocultar da busca'}
          </Button>

          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            loading={ocupado === 'regen'}
            onClick={() =>
              acao(
                'regen',
                () => curarRegenerarResumo(edital.id),
                'Regeneração disparada — o resumo/exigências saem em instantes.',
                'Regenerar chama a IA de novo (custo). Só faça se o resumo estiver errado. Confirmar?',
              )
            }
          >
            Regenerar resumo/exigências
          </Button>
        </Group>
      </Card>
    </Stack>
  );
}
