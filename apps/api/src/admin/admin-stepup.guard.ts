import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { User } from '../users/user.entity';

// Exige step-up VÁLIDO (senha reconfirmada há pouco) para ações sensíveis do
// admin (T-183). Roda DEPOIS do JwtAuthGuard + AdminGuard. Sem step-up →
// 428 com `code: 'step_up_required'`, que o front reconhece para pedir a senha.
@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!user) {
      throw new HttpException('Sessão inválida.', HttpStatus.UNAUTHORIZED);
    }
    const registro = await this.users.findOne({
      where: { id: user.id },
      select: { id: true, adminStepupAte: true },
    });
    const ate = registro?.adminStepupAte ?? null;
    if (ate != null && ate.getTime() > Date.now()) {
      return true;
    }
    // 428 Precondition Required: falta cumprir a pré-condição (reconfirmar senha).
    throw new HttpException(
      {
        statusCode: HttpStatus.PRECONDITION_REQUIRED,
        error: 'Precondition Required',
        message: 'Reconfirme sua senha para continuar.',
        code: 'step_up_required',
      },
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }
}
