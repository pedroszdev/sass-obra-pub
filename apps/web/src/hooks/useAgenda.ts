import { useEffect, useState } from 'react';
import { ApiError, getAgenda } from '../lib/api';
import type { AgendaEvento } from '../types/agenda';

export type AgendaState =
  | { status: 'loading' }
  | { status: 'success'; data: AgendaEvento[] }
  | { status: 'error'; message: string };

/** Carrega a agenda de prazos do usuário (T-91), com cancelamento e retry (T-105). */
export function useAgenda(): { state: AgendaState; reload: () => void } {
  const [state, setState] = useState<AgendaState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getAgenda(controller.signal)
      .then((r) => setState({ status: 'success', data: r.data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Não foi possível carregar a agenda.',
        });
      });
    return () => controller.abort();
  }, [nonce]);

  return { state, reload: () => setNonce((n) => n + 1) };
}
