import type { AuthStatus } from '../context/auth-context';
import type { UserRole } from '../types/auth';

// Decisão de acesso à área /admin (T-181). Extraída como função pura para testar
// sem montar componente (padrão do projeto: lib/* puro + teste).
//
// 'deny' NÃO significa 403: quem chama (AdminRoute) redireciona o negado para "/"
// — o MESMO destino de uma rota inexistente — para não confirmar que a área existe
// a um não-admin (espelha o 404 do backend, T-180). O backend continua sendo a
// trava real; isto é só o roteamento do front.
export type AdminAccess = 'loading' | 'allow' | 'deny';

export function decidirAcessoAdmin(
  status: AuthStatus,
  role: UserRole | undefined,
): AdminAccess {
  if (status === 'loading') return 'loading';
  if (status === 'authenticated' && role === 'ADMIN') return 'allow';
  return 'deny';
}
