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
  createdAt: Date;
  updatedAt: Date;
}

export function toUserResponse(
  user: User,
  municipios: MunicipioPreferido[] = [],
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
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
