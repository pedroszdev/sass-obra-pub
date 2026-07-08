// Espelha o contrato de autenticação do backend (apps/api/src/auth, /users/me).

export type CompanyPorte = 'ME' | 'EPP' | 'DEMAIS';
export type UserRole = 'USER' | 'ADMIN';

// Preferências de notificação (T-89). Push fica fora por ora (UI "em breve").
export interface NotificationPrefs {
  whatsapp: boolean;
  email: boolean;
}

// Município de atuação preferido (T-94), resolvido com nome/UF.
export interface MunicipioPreferido {
  codigoIbge: string;
  nome: string;
  uf: string;
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
  // T-94: vazio = sem preferência (busca cai na UF inteira).
  municipios: MunicipioPreferido[];
  // T-132: e-mail verificado? (o acesso ao produto exige verificado).
  emailVerified: boolean;
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

// Payload do cadastro self-service (T-100). Espelha o RegisterDto do backend:
// uf obrigatória (alvo da captação); cnpj (14 dígitos) e porte opcionais. `role`
// nunca é enviado — o backend sempre cria como USER.
export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  uf: string;
  cnpj?: string;
  porte?: CompanyPorte;
  // Consentimento LGPD (T-102): aceite dos Termos + Privacidade. Deve ser true.
  aceiteTermos: boolean;
}
