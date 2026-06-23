import { ActionIcon } from '@mantine/core';
import { IconStar, IconStarFilled } from '@tabler/icons-react';
import type { MouseEvent } from 'react';
import { useFavorites } from '../context/favorites-context';
import type { EditalListItem } from '../types/edital';

interface FavoriteButtonProps {
  edital: EditalListItem;
  size?: number | string;
}

// Estrela de favoritar (T-31). Em cards (que são Link) impede a navegação ao
// clicar. O estado vem do FavoritesProvider.
export function FavoriteButton({ edital, size = 'md' }: FavoriteButtonProps) {
  const { isFavorito, toggle } = useFavorites();
  const fav = isFavorito(edital.id);

  function handleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    toggle(edital);
  }

  return (
    <ActionIcon
      variant="subtle"
      color={fav ? 'orange' : 'gray'}
      radius="xl"
      size={size}
      onClick={handleClick}
      aria-label={fav ? 'Remover dos salvos' : 'Salvar edital'}
      title={fav ? 'Remover dos salvos' : 'Salvar edital'}
    >
      {fav ? <IconStarFilled size={17} /> : <IconStar size={17} />}
    </ActionIcon>
  );
}
