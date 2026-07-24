import { UserRole } from '../../users/user-role.enum';

// Payload do access token.
export interface JwtPayload {
  sub: string; // id do usuário
  role: UserRole;
  // Impersonação (T-187): presente APENAS no token de "ver como". Guarda o id do
  // ADMIN que iniciou a sessão. Um access token normal nunca tem `imp` — é o que
  // distingue uma sessão de impersonação (só leitura) de uma sessão de verdade.
  imp?: string;
}

// Usuário autenticado anexado à request pelo JwtStrategy.
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  // Impersonação (T-187): id do admin que está "vendo como" este usuário. Setado
  // só quando a requisição vem do cookie de impersonação; o interceptor de
  // somente-leitura barra mutações quando presente.
  impersonatorId?: string;
}
