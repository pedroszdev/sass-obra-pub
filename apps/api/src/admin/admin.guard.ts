import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

// Trava do backoffice do dono (BACKLOG T-180). Só a role ADMIN entra em `/admin/*`.
//
// ⚠️ A checagem é NO BANCO, não no token (decisão do dono): o `/admin` é acessado
// só pelo dono (volume ínfimo), então a query a mais é irrelevante — e em troca
// promover/remover admin vale NA HORA (o token levaria até 15 min para refletir,
// e um ex-admin seguiria admin até expirar). Para a superfície mais privilegiada,
// revogação instantânea vale a query. O `role` do token segue servindo o produto
// (alto volume), só o admin paga o BD.
//
// Quem não é admin recebe **404, não 403** (espírito da enumeração T-175):
// indistinguível de rota inexistente.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!user) throw new NotFoundException();

    const registro = await this.users.findOne({
      where: { id: user.id },
      select: { id: true, role: true },
    });
    if (registro?.role === UserRole.ADMIN) return true;

    // Nunca 403: não confirmar a existência da área a quem não é admin.
    throw new NotFoundException();
  }
}
