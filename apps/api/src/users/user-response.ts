import { Uf } from '../common/uf';
import { CompanyPorte } from './company-porte.enum';
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
  createdAt: Date;
  updatedAt: Date;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    cnpj: user.cnpj,
    porte: user.porte,
    uf: user.uf,
    role: user.role,
    notificationPrefs: user.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
