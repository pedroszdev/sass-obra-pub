import { Box, Stack, Text, Title } from '@mantine/core';
import { IconStar } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { EditalCard } from '../components/EditalCard';
import { EmptyState, LoadingCards } from '../components/StateViews';
import { useFavorites } from '../context/favorites-context';

export function SalvosPage() {
  const { favoritos, loading } = useFavorites();
  const navigate = useNavigate();

  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={900} mx="auto">
        <Title order={2} fz={18}>
          Editais salvos
        </Title>
        <Text fz={13} c="dimmed" mt={2} mb="lg">
          Os editais que você marcou para acompanhar.
        </Text>

        {loading && favoritos.length === 0 ? (
          <LoadingCards count={3} />
        ) : favoritos.length === 0 ? (
          <EmptyState
            icon={<IconStar size={26} />}
            title="Você ainda não salvou nenhum edital."
            description="Toque na estrela de um edital na busca para guardá-lo aqui."
            actionLabel="Buscar editais"
            onAction={() => navigate('/editais')}
          />
        ) : (
          <Stack gap="sm">
            {favoritos.map((edital) => (
              <EditalCard key={edital.id} edital={edital} />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
