import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import {
  clearTokens,
  isAuthenticated,
  onAuthChange,
  setAccessToken,
} from '../lib/auth';
import type { UserMe } from '../types/auth';
import { AuthContext, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    isAuthenticated() ? 'loading' : 'anonymous',
  );

  useEffect(() => {
    let active = true;
    // Validação inicial: se há token guardado, busca o usuário para confirmar
    // que a sessão ainda vale.
    if (isAuthenticated()) {
      api
        .getMe()
        .then((me) => {
          if (active) {
            setUser(me);
            setStatus('authenticated');
          }
        })
        .catch((err: unknown) => {
          if (!active) return;
          // Só DESTRÓI a sessão (clearTokens) num 401 real — sessão inválida
          // (T-110). Um blip de rede no boot (ApiError status 0, cold start do
          // Render) não pode expulsar o usuário: mantém os tokens para um reload
          // recuperar a sessão quando a rede voltar.
          if (err instanceof api.ApiError && err.status === 401) {
            clearTokens();
          }
          setUser(null);
          setStatus('anonymous');
        });
    }
    // Reage à perda de sessão vinda de fora do React — ex.: o cliente HTTP
    // limpando os tokens após um 401 que o refresh não recuperou.
    const unsubscribe = onAuthChange(() => {
      if (!isAuthenticated() && active) {
        setUser(null);
        setStatus('anonymous');
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    clearTokens();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
