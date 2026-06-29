import {
  Badge,
  Box,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Text,
  Title,
} from '@mantine/core';
import { IconStar } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { FavoriteButton } from '../components/FavoriteButton';
import { EmptyState, LoadingCards } from '../components/StateViews';
import { useFavorites } from '../context/favorites-context';
import { brlCompact, daysUntil } from '../lib/format';
import type { EditalListItem } from '../types/edital';
import classes from '../styles/cards.module.css';

// Card de um edital salvo (grid 2-col do handoff): tag mono + estrela, objeto,
// valor e rodapé com o prazo + "Ver detalhe". Card inteiro clicável → detalhe.
function SavedCard({ edital }: { edital: EditalListItem }) {
  const dias = daysUntil(edital.prazoProposta);
  const temPrazo = Number.isFinite(dias);
  const prazoTxt = !temPrazo
    ? 'Prazo não informado'
    : dias < 0
      ? 'Proposta encerrada'
      : dias === 0
        ? 'Proposta encerra hoje'
        : `Proposta em ${dias} dias`;
  const urgente = temPrazo && dias >= 0 && dias <= 3;

  return (
    <Card
      component={Link}
      to={`/editais/${edital.id}`}
      withBorder
      radius="lg"
      p="lg"
      td="none"
      c="inherit"
      className={classes.hoverCard}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Text className="brand-label" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
          {edital.modalidadeNome} · {edital.municipioNome} / {edital.uf}
        </Text>
        <FavoriteButton edital={edital} size="sm" />
      </Group>

      <Text
        fz={16}
        fw={600}
        ff="heading"
        lineClamp={2}
        mt={6}
        style={{ lineHeight: 1.3 }}
      >
        {edital.objeto}
      </Text>

      <Badge color="gray" variant="light" radius="sm" tt="none" mt="sm">
        {brlCompact(edital.valorEstimado)}
      </Badge>

      <Divider my="md" />

      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text fz={12.5} c={urgente ? 'alerta.7' : 'dimmed'} fw={urgente ? 600 : 400}>
          {prazoTxt}
        </Text>
        <Text fz={12.5} fw={600} c="orange.8" style={{ whiteSpace: 'nowrap' }}>
          Ver detalhe →
        </Text>
      </Group>
    </Card>
  );
}

export function SalvosPage() {
  const { favoritos, loading } = useFavorites();
  const navigate = useNavigate();

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={1000} mx="auto">
        <Group justify="space-between" align="flex-end" mb="lg">
          <Box>
            <Title order={1} fz={26} style={{ letterSpacing: '-0.01em' }}>
              Editais salvos
            </Title>
            <Text fz="sm" c="dimmed" mt={2}>
              As obras que você marcou pra acompanhar.
            </Text>
          </Box>
          {favoritos.length > 0 && (
            <Text fz={13} c="dimmed">
              {favoritos.length} {favoritos.length === 1 ? 'edital' : 'editais'}
            </Text>
          )}
        </Group>

        {loading && favoritos.length === 0 ? (
          <LoadingCards count={4} />
        ) : favoritos.length === 0 ? (
          <EmptyState
            icon={<IconStar size={26} />}
            title="Você ainda não salvou nenhum edital."
            description="Toque na estrela de um edital na busca para guardá-lo aqui."
            actionLabel="Buscar editais"
            onAction={() => navigate('/editais')}
          />
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {favoritos.map((edital) => (
              <SavedCard key={edital.id} edital={edital} />
            ))}
          </SimpleGrid>
        )}
      </Box>
    </Box>
  );
}
