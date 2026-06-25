import { useEffect, useState } from 'react';
import { getMunicipios } from '../lib/api';
import type { Municipio } from '../types/geo';

// Cache por UF: o seletor pede a UF em edição e o chip de filtro ativo pede a UF
// aplicada — quase sempre a mesma. Guardamos a Promise para coalescer buscas em
// voo (duas chamadas com a mesma UF compartilham um único request).
const cache = new Map<string, Promise<Municipio[]>>();

function load(uf: string): Promise<Municipio[]> {
  let pending = cache.get(uf);
  if (!pending) {
    pending = getMunicipios(uf).catch((err: unknown) => {
      cache.delete(uf); // falha não fica cacheada — permite nova tentativa
      throw err;
    });
    cache.set(uf, pending);
  }
  return pending;
}

/**
 * Municípios da UF (via GET /geo/municipios), com cache por UF. `uf` vazio →
 * lista vazia sem buscar. Erro → lista vazia (o filtro de município é opcional).
 */
export function useMunicipios(uf: string): {
  municipios: Municipio[];
  loading: boolean;
} {
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uf) {
      setMunicipios([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setMunicipios([]); // não mostra municípios da UF anterior enquanto carrega
    load(uf)
      .then((data) => {
        if (active) setMunicipios(data);
      })
      .catch(() => {
        if (active) setMunicipios([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [uf]);

  return { municipios, loading };
}
