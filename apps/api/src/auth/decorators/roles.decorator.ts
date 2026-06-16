import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/user-role.enum';

export const ROLES_KEY = 'roles';

// Restringe uma rota a papéis específicos. Usar junto com JwtAuthGuard + RolesGuard.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
