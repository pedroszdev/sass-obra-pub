import { useCallback, useEffect, useState } from 'react';
import { ApiError, getProntidao } from '../lib/api';
import type { ProntidaoResult } from '../types/company-profile';

export type ProntidaoState =
  | { status: 'loading' }
  | { status: 'success'; data: ProntidaoResult }
  | { status: 'error'; message: string };

/** Carrega o diagnóstico de prontidão genérica (T-45), com `reload`. */
export function useProntidao(): { state: ProntidaoState; reload: () => void } {
  const [state, setState] = useState<ProntidaoState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // 1º load = skeleton; reload mantém o resultado visível (background).
    setState((prev) => (prev.status === 'success' ? prev : { status: 'loading' }));
    getProntidao(controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Não foi possível carregar sua prontidão.',
        });
      });
    return () => controller.abort();
  }, [nonce]);

  return { state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}
