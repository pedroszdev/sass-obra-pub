import { createContext, useContext } from 'react';
import type { EditalListItem } from '../types/edital';

export interface FavoritesContextValue {
  /** Editais salvos (mais recentes primeiro) — fonte da aba "Salvos". */
  favoritos: EditalListItem[];
  loading: boolean;
  isFavorito: (id: string) => boolean;
  /** Alterna o favorito (otimista); recebe o edital para manter a lista. */
  toggle: (edital: EditalListItem) => void;
  reload: () => void;
}

export const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites deve ser usado dentro de <FavoritesProvider>');
  }
  return ctx;
}
