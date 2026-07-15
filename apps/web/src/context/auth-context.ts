import { createContext, useContext } from 'react';
import type { RegisterInput, UserMe } from '../types/auth';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: UserMe | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  // T-126. Entra ou cadastra — quem decide é o backend (pelo e-mail/google_sub).
  // Devolve o usuário para a tela saber se precisa mandar ao onboarding (sem UF).
  loginGoogle: (idToken: string, aceiteTermos?: boolean) => Promise<UserMe>;
  // T-126b. Assume a sessão já criada no cookie httpOnly (volta do Google por
  // redirect). Devolve o usuário para a tela rotear (sem UF → onboarding).
  entrarPeloCookie: () => Promise<UserMe>;
  logout: () => Promise<void>;
  // Re-busca /users/me e atualiza o contexto (T-108: refletir perfil/municípios
  // salvos no onboarding sem exigir reload).
  refreshUser: () => Promise<UserMe>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return ctx;
}
