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
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
