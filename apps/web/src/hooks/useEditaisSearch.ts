import { useCallback, useEffect, useState } from 'react';
import { ApiError, getEditaisAptos, searchEditais } from '../lib/api';
import type { BuscaResult, SearchEditaisParams } from '../types/edital';

export type SearchState =
  | { status: 'loading' }
  | { status: 'success'; result: BuscaResult }
  | { status: 'error'; message: string };

/**
 * Busca editais reagindo a mudanças nos parâmetros. Com `apto`, chama o filtro
 * de aptidão (T-53) em vez da busca normal — o resultado é normalizado (os itens
 * podem trazer `veredito`). Cancela a requisição anterior ao mudar de
 * filtro/página/modo; `reload` refaz a chamada atual.
 *
 * Stale-while-revalidate: enquanto recarrega (troca de página/filtro/ordenação
 * ou reload), mantém os resultados anteriores na tela — só a 1ª carga (ou após
 * erro) mostra esqueletos. `isFetching` sinaliza a revalidação em andamento,
 * para a UI poder esmaecer a lista sem apagá-la.
 */
export function useEditaisSearch(
  params: SearchEditaisParams,
  apto = false,
): { state: SearchState; reload: () => void; isFetching: boolean } {
  const [state, setState] = useState<SearchState>({ status: 'loading' });
  const [isFetching, setIsFetching] = useState(true);
  const [nonce, setNonce] = useState(0);
  // Chave estável dos parâmetros (+ modo) para disparar o efeito.
  const key = JSON.stringify(params) + (apto ? '|apto' : '');

  useEffect(() => {
    const controller = new AbortController();
    setIsFetching(true);
    // Só volta a "loading" (esqueletos) se ainda não há resultados; havendo,
    // mantém-nos visíveis durante o refetch (stale-while-revalidate).
    setState((prev) => (prev.status === 'success' ? prev : { status: 'loading' }));
    const fetcher: Promise<BuscaResult> = apto
      ? getEditaisAptos(params, controller.signal)
      : searchEditais(params, controller.signal);
    fetcher
      .then((result) => {
        setState({ status: 'success', result });
        setIsFetching(false);
      })
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
        setIsFetching(false);
      });
    return () => controller.abort();
    // `key` codifica `params` + modo; reexecuta também ao chamar reload (nonce).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  // Estável: usado em deps de efeito (auto-reload da captação sob demanda).
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { state, reload, isFetching };
}
