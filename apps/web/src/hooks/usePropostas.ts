import { useCallback, useEffect, useState } from 'react';
import { ApiError, getPropostas } from '../lib/api';
import type { Proposta } from '../types/proposta';

export type PropostasState =
  | { status: 'loading' }
  | { status: 'success'; data: Proposta[] }
  | { status: 'error'; message: string };

/** Carrega as propostas do usuário, com cancelamento e `reload`. */
export function usePropostas(): {
  state: PropostasState;
  reload: () => void;
} {
  const [state, setState] = useState<PropostasState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // No 1º load mostra skeleton; num reload (já com dados) refaz em background
    // mantendo a lista visível, para a tela não "piscar" a cada ação.
    setState((prev) => (prev.status === 'success' ? prev : { status: 'loading' }));
    getPropostas(controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Não foi possível carregar seus orçamentos.',
        });
      });
    return () => controller.abort();
  }, [nonce]);

  return { state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}
