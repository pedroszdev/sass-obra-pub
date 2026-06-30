import {
  Box,
  Button,
  Card,
  Flex,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconExternalLink,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DiagnosticoEdital } from '../components/DiagnosticoEdital';
import { ResumoIA } from '../components/ResumoIA';
import { ErrorState } from '../components/StateViews';
import { useFavorites } from '../context/favorites-context';
import { useEdital } from '../hooks/useEdital';
import { createProposta, getPropostasDoEdital } from '../lib/api';
import { brl, daysUntil, fmtDate, fmtDateTime } from '../lib/format';
import type { EditalDetail } from '../types/edital';

function DetailContent({ edital }: { edital: EditalDetail }) {
  const navigate = useNavigate();
  const { isFavorito, toggle } = useFavorites();
  const fav = isFavorito(edital.id);

  // Vínculo edital → proposta (T-71): se já há proposta para esta obra, abre-a;
  // senão cria uma já vinculada e leva ao editor.
  const [propostaId, setPropostaId] = useState<string | null>(null);
  const [montando, setMontando] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getPropostasDoEdital(edital.id, controller.signal)
      .then((ps) => setPropostaId(ps[0]?.id ?? null))
      .catch(() => {
        /* sem proposta listada — segue como "montar" */
      });
    return () => controller.abort();
  }, [edital.id]);

  async function montarProposta(): Promise<void> {
    if (montando) return;
    setMontando(true);
    try {
      const alvo =
        propostaId ??
        (
          await createProposta({
            editalId: edital.id,
            titulo: edital.objeto.slice(0, 255),
          })
        ).id;
      navigate(`/orcamentos/${alvo}`);
    } catch {
      setMontando(false); // mantém na tela em caso de falha
    }
  }

  const dias = daysUntil(edital.prazoProposta);
  const temPrazo = Number.isFinite(dias);
  const prazoLabel = !temPrazo
    ? '—'
    : dias < 0
      ? 'Encerrado'
      : dias === 0
        ? 'Hoje'
        : `${dias} dias`;
  const prazoUrgente = temPrazo && dias >= 0 && dias <= 5;

  // Ficha oficial — sem os campos técnicos (Identificador/Capturado/Atualizado),
  // removidos do detalhe por decisão de produto (CLAUDE.md §6).
  const rows: [string, string][] = [
    ['Órgão', edital.orgaoNome],
    ['CNPJ do órgão', edital.orgaoCnpj ?? 'Não informado'],
    ['Município / UF', `${edital.municipioNome} / ${edital.uf}`],
    ['Código IBGE', edital.codigoIbge ?? '—'],
    ['Modalidade', edital.modalidadeNome],
    ['Situação', edital.situacao ?? '—'],
    ['Valor estimado', brl(edital.valorEstimado)],
    ['Data de publicação', fmtDate(edital.dataPublicacao)],
    ['Fonte', edital.fonte],
  ];

  return (
    <Stack gap="lg">
      {/* topo: voltar + ações */}
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Button
          variant="subtle"
          color="orange"
          size="compact-sm"
          px={0}
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate(-1)}
        >
          Voltar para a busca
        </Button>
        <Group gap="xs">
          <Button
            variant={fav ? 'light' : 'default'}
            color="orange"
            size="sm"
            leftSection={fav ? <IconStarFilled size={16} /> : <IconStar size={16} />}
            onClick={() => toggle(edital)}
          >
            {fav ? 'Salvo' : 'Salvar'}
          </Button>
          <Button
            component="a"
            href={edital.linkOrigem ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            disabled={!edital.linkOrigem}
            variant="default"
            size="sm"
            rightSection={<IconExternalLink size={16} />}
          >
            Ver edital (PDF)
          </Button>
          <Button
            color="orange"
            size="sm"
            onClick={montarProposta}
            loading={montando}
          >
            {propostaId ? 'Abrir proposta' : 'Montar proposta'}
          </Button>
        </Group>
      </Group>

      {/* duas colunas */}
      <Flex gap="lg" align="flex-start" direction={{ base: 'column', md: 'row' }}>
        {/* coluna principal */}
        <Box style={{ flex: 1, minWidth: 0 }} w={{ base: '100%', md: 'auto' }}>
          <Stack gap="lg">
            <Box>
              <Text className="brand-label" lineClamp={1}>
                {edital.modalidadeNome} · {edital.orgaoNome}
              </Text>
              <Title order={1} fz={26} mt={6} style={{ lineHeight: 1.25, letterSpacing: '-0.01em' }}>
                {edital.objeto}
              </Title>
            </Box>

            {/* resumo com IA real (T-50) */}
            <ResumoIA editalId={edital.id} />

            {/* ficha oficial do edital */}
            <Card withBorder radius="lg" p="xl">
              <Text className="brand-label" mb="md">
                Ficha oficial do edital
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing="md">
                {rows.map(([label, value]) => (
                  <Box key={label}>
                    <Text fz={11.5} c="dimmed" mb={2}>
                      {label}
                    </Text>
                    <Text fz={14} fw={500} ff="monospace" style={{ wordBreak: 'break-word' }}>
                      {value}
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            </Card>
          </Stack>
        </Box>

        {/* sidebar */}
        <Box
          w={{ base: '100%', md: 340 }}
          style={{ flex: 'none', position: 'sticky', top: 76 }}
        >
          <Stack gap="lg">
            {/* diagnóstico específico real (T-52) — edital × perfil */}
            <DiagnosticoEdital editalId={edital.id} />

            {/* prazo + CTA */}
            <Card withBorder radius="lg" p="lg">
              <Text className="brand-label">Prazo pra enviar proposta</Text>
              <Text fz={32} fw={800} c={prazoUrgente ? 'alerta.7' : 'orange.8'} lh={1.1} mt={4}>
                {prazoLabel}
              </Text>
              <Text fz={12.5} c="dimmed" mt={2}>
                {fmtDateTime(edital.prazoProposta)}
              </Text>
              <Button
                fullWidth
                color="orange"
                mt="md"
                onClick={montarProposta}
                loading={montando}
              >
                {propostaId ? 'Abrir proposta' : 'Montar proposta agora'}
              </Button>
            </Card>
          </Stack>
        </Box>
      </Flex>
    </Stack>
  );
}

function DetailSkeleton() {
  return (
    <Stack gap="lg">
      <Skeleton h={20} w={160} />
      <Flex gap="lg" align="flex-start" direction={{ base: 'column', md: 'row' }}>
        <Box style={{ flex: 1, minWidth: 0 }} w={{ base: '100%', md: 'auto' }}>
          <Skeleton h={28} w="80%" mb="md" />
          <Card withBorder radius="lg" p="xl">
            <Skeleton h={12} radius="xl" mb="sm" />
            <Skeleton h={12} radius="xl" mb="sm" />
            <Skeleton h={12} w="60%" radius="xl" />
          </Card>
        </Box>
        <Box w={{ base: '100%', md: 340 }} style={{ flex: 'none' }}>
          <Card withBorder radius="lg" p="xl">
            <Skeleton h={46} />
          </Card>
        </Box>
      </Flex>
    </Stack>
  );
}

export function EditalDetailPage() {
  const { id } = useParams();
  const { state, reload } = useEdital(id);

  return (
    <Box px={{ base: 'md', sm: 'lg' }} py="lg" style={{ flex: 1 }}>
      <Box maw={1120} mx="auto">
        {state.status === 'loading' && <DetailSkeleton />}

        {state.status === 'error' &&
          (state.notFound ? (
            <ErrorState
              title="Edital não encontrado."
              description="Ele pode ter saído da base ou o endereço está incorreto."
            />
          ) : (
            <ErrorState
              title="Não foi possível carregar este edital."
              description={state.message}
              onRetry={reload}
            />
          ))}

        {state.status === 'success' && <DetailContent edital={state.edital} />}
      </Box>
    </Box>
  );
}
