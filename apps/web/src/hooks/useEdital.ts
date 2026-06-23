import { useEffect, useState } from 'react';
import { ApiError, getEdital } from '../lib/api';
import type { EditalDetail } from '../types/edital';

export type EditalState =
  | { status: 'loading' }
  | { status: 'success'; edital: EditalDetail }
  | { status: 'error'; message: string; notFound: boolean };

/** Carrega o detalhe de um edital por id, com cancelamento e `reload`. */
export function useEdital(id: string | undefined): {
  state: EditalState;
  reload: () => void;
} {
  const [state, setState] = useState<EditalState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) {
      setState({ status: 'error', message: 'Edital não informado.', notFound: true });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    getEdital(id, controller.signal)
      .then((edital) => setState({ status: 'success', edital }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const notFound = err instanceof ApiError && err.status === 404;
        setState({
          status: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Não foi possível carregar este edital.',
          notFound,
        });
      });
    return () => controller.abort();
  }, [id, nonce]);

  return { state, reload: () => setNonce((n) => n + 1) };
}
