import { UserRole } from '../../users/user-role.enum';

// Payload do access token.
export interface JwtPayload {
  sub: string; // id do usuário
  role: UserRole;
}

// Usuário autenticado anexado à request pelo JwtStrategy.
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}
