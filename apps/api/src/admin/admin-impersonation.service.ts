import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { CookieResponse, setImpersonationCookie } from '../auth/refresh-cookie';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

// Impersonação "ver como" do backoffice (T-187). Inicia a sessão sobreposta: emite
// o token de impersonação e grava o cookie obrapub_imp. Só leitura — o
// ImpersonationReadOnlyInterceptor barra toda mutação enquanto ela dura.
//
// Chamada por AdminAccountsController atrás de JwtAuthGuard + AdminGuard +
// AdminStepUpGuard (é ação sensível: exige a senha reconfirmada) e auditada.
@Injectable()
export class AdminImpersonationService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly auth: AuthService,
  ) {}

  // Abre a impersonação do `alvoId` pelo admin `adminId`, gravando o cookie na
  // resposta. 404 se o alvo não existe; recusa impersonar outra conta ADMIN
  // (nunca assumir uma conta privilegiada — seria escalar em vez de dar suporte).
  async iniciar(
    alvoId: string,
    adminId: string,
    res: CookieResponse,
  ): Promise<{ ok: true }> {
    const alvo = await this.users.findOne({ where: { id: alvoId } });
    if (!alvo) throw new NotFoundException('Conta não encontrada.');
    if (alvo.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Não é possível ver como uma conta de administrador.',
      );
    }
    const token = await this.auth.issueImpersonationToken(alvo, adminId);
    setImpersonationCookie(res, token);
    return { ok: true };
  }
}
