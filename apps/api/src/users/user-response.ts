import { Acesso, MotivoBloqueio } from '../assinaturas/acesso';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../assinaturas/assinatura-status.enum';
import { Plano } from '../assinaturas/precos';
import { Uf } from '../common/uf';
import { CompanyPorte } from './company-porte.enum';
import { MunicipioPreferido } from './users.service';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationPrefs,
  User,
} from './user.entity';
import { UserRole } from './user-role.enum';

// Forma do usuário exposta pela API — sem passwordHash.
export interface UserResponse {
  id: string;
  email: string;
  name: string;
  cnpj: string | null;
  porte: CompanyPorte | null;
  uf: Uf | null;
  role: UserRole;
  // T-89: nunca null na resposta — quando o usuário não configurou, vêm os defaults.
  notificationPrefs: NotificationPrefs;
  // T-94: municípios de atuação preferidos (vazio = sem preferência → UF inteira).
  municipios: MunicipioPreferido[];
  // T-132: e-mail verificado? (o acesso ao produto exige verificado).
  emailVerified: boolean;
  // T-126. Dois booleanos em vez do `provider` cru porque é isso que a UI decide:
  // sem senha, não há aba "trocar senha" e a exclusão pede o Google. Note que uma
  // conta local que vinculou o Google tem os DOIS true.
  temSenha: boolean;
  googleVinculado: boolean;
  // T-127: estado da assinatura — o front RENDERIZA ("faltam 5 dias"), nunca
  // decide o acesso (§3.3). Null só em resposta antiga/sem assinatura.
  assinatura: AssinaturaResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

// O que o front precisa saber sobre a assinatura (T-127). Sem ids da Stripe:
// eles são detalhe interno de cobrança, não têm uso na UI.
export interface AssinaturaResponse {
  status: AssinaturaStatus;
  /** true = pode usar o produto. Quem decide é o BACKEND (§3.3). */
  acessoPermitido: boolean;
  emTrial: boolean;
  /** Cancelada no fim do período: acesso até `currentPeriodEnd`, sem renovar. */
  cancelAtPeriodEnd: boolean;
  /** Dias inteiros que faltam do trial (0 fora dele). */
  diasRestantesTrial: number;
  motivoBloqueio: MotivoBloqueio | null;
  /** Plano contratado (T-131) — o PREÇO não vem daqui, vem da Stripe. */
  plano: Plano;
  /** Início do trial: a barra de progresso da tela precisa dos dois extremos. */
  trialStartedAt: Date;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

export function toUserResponse(
  user: User,
  municipios: MunicipioPreferido[] = [],
  assinatura: AssinaturaResponse | null = null,
): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    cnpj: user.cnpj,
    porte: user.porte,
    uf: user.uf,
    role: user.role,
    notificationPrefs: user.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
    municipios,
    emailVerified: user.emailVerifiedAt != null,
    temSenha: user.passwordHash != null,
    googleVinculado: user.googleSub != null,
    assinatura,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Monta o bloco de assinatura a partir da entidade e do acesso já calculado pela
// função pura (§3.3) — nunca recalculando nada aqui.
export function toAssinaturaResponse(
  assinatura: Assinatura | null,
  acesso: Acesso,
): AssinaturaResponse | null {
  if (!assinatura) return null;
  return {
    status: assinatura.status,
    acessoPermitido: acesso.permitido,
    emTrial: acesso.emTrial,
    cancelAtPeriodEnd: assinatura.cancelAtPeriodEnd,
    diasRestantesTrial: acesso.diasRestantesTrial,
    motivoBloqueio: acesso.motivo ?? null,
    plano: assinatura.plano,
    // O início do trial é o `createdAt` da assinatura — NÃO `trialEndsAt - 7d`.
    // Derivar do fim quebraria calado no dia em que o TRIAL_DIAS mudasse: os
    // trials antigos passariam a exibir uma data de início que nunca existiu.
    trialStartedAt: assinatura.createdAt,
    trialEndsAt: assinatura.trialEndsAt,
    currentPeriodEnd: assinatura.currentPeriodEnd,
  };
}
