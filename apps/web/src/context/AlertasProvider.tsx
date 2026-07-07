import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as api from '../lib/api';
import type { AlertaItem } from '../types/alerta';
import { AlertasContext } from './alertas-context';
import { useAuth } from './auth-context';

// Central de notificações (T-90). Carrega ao autenticar; o sino do header e a
// tela de Alertas compartilham este estado para o "marcar lido" zerar o badge.
export function AlertasProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [itens, setItens] = useState<AlertaItem[]>([]);
  const [naoLidos, setNaoLidos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api
      .getAlertas()
      .then((r) => {
        setItens(r.itens);
        setNaoLidos(r.naoLidos);
      })
      .catch(() => {
        // O sino do header segue discreto, mas a TELA de Alertas precisa
        // distinguir "deu erro" de "não há nada" (T-105).
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      load();
    } else {
      setItens([]);
      setNaoLidos(0);
    }
  }, [status, load]);

  const marcarLido = useCallback(() => {
    setNaoLidos(0); // otimista — zera o sino na hora
    setItens((prev) => prev.map((a) => ({ ...a, novo: false })));
    api.marcarAlertasLido().catch(() => load());
  }, [load]);

  const value = useMemo(
    () => ({ itens, naoLidos, loading, error, reload: load, marcarLido }),
    [itens, naoLidos, loading, error, load, marcarLido],
  );

  return (
    <AlertasContext.Provider value={value}>{children}</AlertasContext.Provider>
  );
}
