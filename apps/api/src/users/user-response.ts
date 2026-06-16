import { CompanyPorte } from './company-porte.enum';
import { UserRole } from './user-role.enum';
import { User } from './user.entity';

// Forma do usuário exposta pela API — sem passwordHash.
export interface UserResponse {
  id: string;
  email: string;
  name: string;
  cnpj: string | null;
  porte: CompanyPorte | null;
  role: UserRole;
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
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
