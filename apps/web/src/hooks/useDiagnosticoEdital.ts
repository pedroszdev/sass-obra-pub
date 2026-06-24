import { useEffect, useState } from 'react';
import { ApiError, getDiagnosticoEdital } from '../lib/api';
import type { DiagnosticoEditalResponse } from '../types/edital';

export type DiagnosticoState =
  | { status: 'loading' }
  | { status: 'success'; result: DiagnosticoEditalResponse }
  | { status: 'error'; message: string };

// Carrega o diagnóstico do usuário para um edital (T-51/T-52). A 1ª chamada
// pode disparar a extração por IA (cacheada depois) — leva alguns segundos.
export function useDiagnosticoEdital(id: string | undefined): {
  state: DiagnosticoState;
  reload: () => void;
} {
  const [state, setState] = useState<DiagnosticoState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    getDiagnosticoEdital(id, controller.signal)
      .then((result) => setState({ status: 'success', result }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Não foi possível analisar sua prontidão.',
        });
      });
    return () => controller.abort();
  }, [id, nonce]);

  return { state, reload: () => setNonce((n) => n + 1) };
}
