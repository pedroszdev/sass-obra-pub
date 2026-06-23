import { useEffect, useState } from 'react';
import { ApiError, searchEditais } from '../lib/api';
import type { EditalSearchResult, SearchEditaisParams } from '../types/edital';

export type SearchState =
  | { status: 'loading' }
  | { status: 'success'; result: EditalSearchResult }
  | { status: 'error'; message: string };

/**
 * Busca editais reagindo a mudanças nos parâmetros. Cancela a requisição
 * anterior (AbortController) ao mudar de filtro/página. `reload` força refazer
 * a chamada atual (botão "Tentar de novo").
 */
export function useEditaisSearch(params: SearchEditaisParams): {
  state: SearchState;
  reload: () => void;
} {
  const [state, setState] = useState<SearchState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  // Chave estável dos parâmetros para disparar o efeito sem comparar objeto.
  const key = JSON.stringify(params);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    searchEditais(params, controller.signal)
      .then((result) => setState({ status: 'success', result }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Não foi possível carregar os editais.',
        });
      });
    return () => controller.abort();
    // `key` codifica `params`; reexecuta também ao chamar reload (nonce).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { state, reload: () => setNonce((n) => n + 1) };
}
