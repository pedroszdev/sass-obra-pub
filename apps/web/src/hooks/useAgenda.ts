import { useEffect, useState } from 'react';
import { ApiError, getAgenda } from '../lib/api';
import type { AgendaEvento } from '../types/agenda';

export type AgendaState =
  | { status: 'loading' }
  | { status: 'success'; data: AgendaEvento[] }
  | { status: 'error'; message: string };

/** Carrega a agenda de prazos do usuário (T-91), com cancelamento. */
export function useAgenda(): { state: AgendaState } {
  const [state, setState] = useState<AgendaState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
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
  }, []);

  return { state };
}
