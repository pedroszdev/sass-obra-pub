import { useCallback, useEffect, useState } from 'react';
import { ApiError, getCompanyProfile } from '../lib/api';
import type { CompanyProfileSnapshot } from '../types/company-profile';

export type CompanyProfileState =
  | { status: 'loading' }
  | { status: 'success'; data: CompanyProfileSnapshot }
  | { status: 'error'; message: string };

/** Carrega o snapshot do perfil de habilitação, com cancelamento e `reload`. */
export function useCompanyProfile(): {
  state: CompanyProfileState;
  reload: () => void;
} {
  const [state, setState] = useState<CompanyProfileState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // No 1º load mostra skeleton; num reload (já com dados) refaz em background
    // mantendo a lista visível, para a tela não "piscar" a cada ação.
    setState((prev) => (prev.status === 'success' ? prev : { status: 'loading' }));
    getCompanyProfile(controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Não foi possível carregar seu perfil.',
        });
      });
    return () => controller.abort();
  }, [nonce]);

  return { state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}
