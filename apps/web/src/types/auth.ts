// Espelha o contrato de autenticação do backend (apps/api/src/auth, /users/me).

export type CompanyPorte = 'ME' | 'EPP' | 'DEMAIS';
export type UserRole = 'USER' | 'ADMIN';

// Preferências de notificação (T-89). Push fica fora por ora (UI "em breve").
export interface NotificationPrefs {
  whatsapp: boolean;
  email: boolean;
}

export interface UserMe {
  id: string;
  email: string;
  name: string;
  cnpj: string | null;
  porte: CompanyPorte | null;
  uf: string | null;
  role: UserRole;
  notificationPrefs: NotificationPrefs;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// POST /auth/login e /auth/register devolvem os tokens + o usuário.
export interface AuthResult extends AuthTokens {
  user: UserMe;
}
