import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';

// Trava do backoffice do dono (BACKLOG T-180). Só a role ADMIN entra em `/admin/*`.
//
// Aplicado junto do JwtAuthGuard (`@UseGuards(JwtAuthGuard, AdminGuard)`), depois
// dele — o JwtAuthGuard popula `req.user`. NÃO é guard global.
//
// ⚠️ Quem não é admin recebe **404, não 403** (decisão de arquitetura do épico,
// mesmo espírito da enumeração de contas T-175): um 403 confirmaria que a área
// existe. Lançamos NotFoundException para que um usuário comum não distinga
// `/admin/*` de uma rota inexistente. Sem usuário (se algum dia faltar o
// JwtAuthGuard antes) também cai no 404 — defesa em profundidade, nunca vaza.
//
// A role vem do access token (assinado em auth.service com `user.role`), então
// promover alguém no banco só vale a partir do próximo token (login/refresh).
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (user?.role === UserRole.ADMIN) {
      return true;
    }

    // Nunca 403: não confirmar a existência da área a quem não é admin.
    throw new NotFoundException();
  }
}
