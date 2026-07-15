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
  // T-126. Conta criada pelo Google não tem senha: sem aba "trocar senha", e a
  // exclusão pede re-autenticação no Google. Conta local que vinculou o Google
  // tem os dois true.
  temSenha: boolean;
  googleVinculado: boolean;
  // T-127: estado da assinatura. O front RENDERIZA — quem decide o acesso é o
  // backend (§3.3). Null só em resposta antiga.
  assinatura: AssinaturaMe | null;
  createdAt: string;
  updatedAt: string;
}

// Espelha o AssinaturaResponse da API (T-127). Sem ids da Stripe: são detalhe
// interno de cobrança, sem uso na UI.
export type AssinaturaStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled';

export type MotivoBloqueio =
  | 'trial_expirado'
  | 'sem_pagamento'
  | 'cancelada';

export interface AssinaturaMe {
  status: AssinaturaStatus;
  /** Decidido pelo BACKEND. O front nunca calcula isto. */
  acessoPermitido: boolean;
  emTrial: boolean;
  /** Cancelada no fim do período: acesso até currentPeriodEnd, sem renovar. */
  cancelAtPeriodEnd: boolean;
  diasRestantesTrial: number;
  motivoBloqueio: MotivoBloqueio | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

// POST /auth/login e /auth/register devolvem o access token + o usuário. O
// refresh token NÃO vem no corpo (T-119a): fica num cookie httpOnly que o JS não
// lê — o front nunca o manuseia.
// T-155: NENHUM token no corpo. Os dois (access e refresh) vêm em cookies
// httpOnly, que o JS não lê — não há o que guardar aqui.
export interface AuthResult {
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
