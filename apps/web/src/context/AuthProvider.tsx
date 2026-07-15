import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import { limparSessao, marcarSessao, onAuthChange, temSessao } from '../lib/auth';
import type { RegisterInput, UserMe } from '../types/auth';
import { AuthContext, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null);
  // T-155: não há mais token no JS para consultar. `temSessao()` é só uma DICA
  // (um marcador), não a credencial — a verdade está no cookie httpOnly e no
  // backend. Por isso o boot pergunta ao /users/me em vez de confiar no storage.
  const [status, setStatus] = useState<AuthStatus>(() =>
    temSessao() ? 'loading' : 'anonymous',
  );

  useEffect(() => {
    let active = true;
    // Validação inicial: havendo marcador de sessão, pergunta ao backend quem é o
    // usuário. Se o cookie de access expirou, o cliente HTTP renova sozinho pelo
    // cookie de refresh (e só um 401 depois disso significa sessão morta).
    if (temSessao()) {
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
            limparSessao();
          }
          setUser(null);
          setStatus('anonymous');
        });
    }
    // Reage à perda de sessão vinda de fora do React — ex.: o cliente HTTP
    // limpando os tokens após um 401 que o refresh não recuperou.
    const unsubscribe = onAuthChange(() => {
      if (!temSessao() && active) {
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
    marcarSessao();
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  // Cadastro self-service (T-100): auto-login após criar a conta (mesmo efeito
  // do login — o backend já devolve token + usuário).
  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.register(input);
    marcarSessao();
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  // Entrar/cadastrar com Google (T-126). O backend decide se é login ou cadastro;
  // devolvemos o usuário para a tela rotear (conta nova nasce sem UF → onboarding).
  const loginGoogle = useCallback(
    async (idToken: string, aceiteTermos?: boolean) => {
      const result = await api.loginGoogle(idToken, aceiteTermos);
      marcarSessao();
      setUser(result.user);
      setStatus('authenticated');
      return result.user;
    },
    [],
  );

  // Assume a sessão que já existe nos cookies httpOnly (T-126b). É o caminho de
  // volta do Google por redirect: os cookies vieram no 302 e este front ainda não
  // sabe de nada — renova a sessão e busca o usuário.
  const entrarPeloCookie = useCallback(async () => {
    await api.renovarSessao();
    marcarSessao();
    const me = await api.getMe();
    setUser(me);
    setStatus('authenticated');
    return me;
  }, []);

  const logout = useCallback(async () => {
    // O backend limpa os COOKIES (é o único que pode: são httpOnly). Aqui só cai
    // o marcador local e o estado do React.
    await api.logout();
    limparSessao();
    setUser(null);
    setStatus('anonymous');
  }, []);

  // Re-hidrata o usuário do /users/me (T-108). Best-effort: uma falha não
  // desloga — só não atualiza o contexto agora. Devolve o usuário fresco para
  // quem precisa reagir ao novo estado (ex.: a tela de assinatura esperando a
  // confirmação do pagamento chegar pelo webhook).
  const refreshUser = useCallback(async (): Promise<UserMe> => {
    const me = await api.getMe();
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      login,
      register,
      loginGoogle,
      entrarPeloCookie,
      logout,
      refreshUser,
    }),
    [
      status,
      user,
      login,
      register,
      loginGoogle,
      entrarPeloCookie,
      logout,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
