import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as api from '../lib/api';
import type { EditalListItem } from '../types/edital';
import { useAuth } from './auth-context';
import { FavoritesContext } from './favorites-context';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [favoritos, setFavoritos] = useState<EditalListItem[]>([]);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api
      .getFavoritos()
      .then((r) => {
        setFavoritos(r.data);
        setIds(new Set(r.data.map((e) => e.id)));
      })
      .catch(() => {
        // A tela "Salvos" precisa distinguir erro de "não salvou nada" (T-105) —
        // senão parece que os favoritos sumiram.
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // Carrega ao autenticar; limpa ao sair.
  useEffect(() => {
    if (status === 'authenticated') {
      load();
    } else {
      setFavoritos([]);
      setIds(new Set());
    }
  }, [status, load]);

  const isFavorito = useCallback((id: string) => ids.has(id), [ids]);

  const toggle = useCallback(
    (edital: EditalListItem) => {
      const id = edital.id;
      const wasFav = ids.has(id);

      // Atualização otimista (Set + lista).
      setIds((prev) => {
        const next = new Set(prev);
        if (wasFav) next.delete(id);
        else next.add(id);
        return next;
      });
      setFavoritos((prev) =>
        wasFav ? prev.filter((e) => e.id !== id) : [edital, ...prev],
      );

      const action = wasFav ? api.removeFavorito(id) : api.addFavorito(id);
      action.catch(() => {
        // Reverte em caso de erro.
        setIds((prev) => {
          const next = new Set(prev);
          if (wasFav) next.add(id);
          else next.delete(id);
          return next;
        });
        setFavoritos((prev) =>
          wasFav ? [edital, ...prev] : prev.filter((e) => e.id !== id),
        );
      });
    },
    [ids],
  );

  const value = useMemo(
    () => ({ favoritos, loading, error, isFavorito, toggle, reload: load }),
    [favoritos, loading, error, isFavorito, toggle, load],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}
