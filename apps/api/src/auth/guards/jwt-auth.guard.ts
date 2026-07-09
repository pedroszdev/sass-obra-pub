import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Exige um access token válido (Bearer). Aplicado por rota — não global,
// para manter /health aberto.
//
// `@Public()` libera uma rota específica dentro de um controller protegido
// (ex.: a contagem de editais abertos, exibida na tela de login, que não tem
// sessão). Guards de método SOMAM aos do controller, então sem esta metadata
// não haveria como abrir uma rota isolada.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
