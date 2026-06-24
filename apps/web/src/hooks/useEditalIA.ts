import { useEffect, useState } from 'react';
import { ApiError, getEditalIa } from '../lib/api';
import type { EditalIaResult } from '../types/edital';

export type EditalIaState =
  | { status: 'loading' }
  | { status: 'success'; result: EditalIaResult }
  | { status: 'error'; message: string };

// Carrega a análise por IA do edital (resumo T-50 / exigências T-49). A 1ª
// chamada pode levar alguns segundos (a IA lê o PDF); depois vem do cache.
export function useEditalIA(id: string | undefined): {
  state: EditalIaState;
  reload: () => void;
} {
  const [state, setState] = useState<EditalIaState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    getEditalIa(id, controller.signal)
      .then((result) => setState({ status: 'success', result }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Não foi possível analisar este edital.',
        });
      });
    return () => controller.abort();
  }, [id, nonce]);

  return { state, reload: () => setNonce((n) => n + 1) };
}
