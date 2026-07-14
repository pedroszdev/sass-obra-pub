import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AssinaturasService } from './assinaturas.service';

// Paywall (BACKLOG T-130). Barra as rotas do PRODUTO quando não há trial ativo
// nem assinatura ativa — o "pode usar?" é decidido no backend (§3.3), o front só
// renderiza o bloqueio.
//
// Aplicado POR CONTROLLER, junto do JwtAuthGuard (`@UseGuards(JwtAuthGuard,
// SubscriptionGuard)`), e NÃO como guard global: um APP_GUARD roda ANTES dos
// guards de controller, então `req.user` (que o JwtAuthGuard popula) ainda não
// existiria. A ordem no array é respeitada — autentica, depois checa o acesso.
//
// FICAM DE FORA (a whitelist é a AUSÊNCIA deste guard, não uma lista aqui):
//   - `users/me`   — o front precisa dele para SABER que está bloqueado;
//   - `assinaturas/*` — trancar o caminho de pagar seria uma porta sem maçaneta;
//   - auth, health, geo — sem sessão de produto.
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly assinaturas: AssinaturasService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    // Sem usuário autenticado, não é papel deste guard decidir (o JwtAuthGuard já
    // teria barrado). Evita 402 onde deveria ser 401.
    if (!req.user) return true;

    const acesso = await this.assinaturas.acessoDe(req.user.id);
    if (acesso.permitido) return true;

    // 402 Payment Required: o status HTTP feito exatamente para isto. O corpo
    // leva o motivo para o front escolher a mensagem ("teste acabou" ≠ "pagamento
    // pendente") e a rota para onde mandar.
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        message: 'Seu acesso está bloqueado. Assine para continuar.',
        motivo: acesso.motivo,
        redirect: '/assinatura',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
