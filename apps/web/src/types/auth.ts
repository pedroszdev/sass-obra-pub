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

// POST /auth/login e /auth/register devolvem o access token + o usuário. O
// refresh token NÃO vem no corpo (T-119a): fica num cookie httpOnly que o JS não
// lê — o front nunca o manuseia.
export interface AuthResult {
  accessToken: string;
  user: UserMe;
}
