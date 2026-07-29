import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestComIp, ipDoCliente } from '../../common/ip-cliente';
import { TURNSTILE_ACTION_KEY } from './turnstile.decorator';
import { TurnstileService } from './turnstile.service';

interface RequestComToken extends RequestComIp {
  body?: { turnstileToken?: unknown };
}

// Mensagem ÚNICA e genérica para toda recusa. Não diz se o token faltou, expirou,
// foi reusado ou se o hostname era outro: cada distinção dessas é sinal grátis
// para quem está automatizando o cadastro. O motivo real vai para o log.
const MSG =
  'Não foi possível confirmar que você não é um robô. Recarregue a página e tente novamente.';

/**
 * Barra o cadastro sem Turnstile válido (T-203).
 *
 * Aplicado por rota (`@UseGuards(TurnstileGuard)` + `@Turnstile('register')`),
 * não global — só as superfícies públicas escolhidas pagam a verificação.
 *
 * ⚠️ Ordem importa e é a favor do custo: o `ThrottlerGuard` é global, então roda
 * ANTES deste. Uma enxurrada de cadastros toma 429 sem gastar uma chamada ao
 * siteverify.
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly turnstile: TurnstileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<string | undefined>(
      TURNSTILE_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action) {
      // Erro de programação, não de quem chamou: o guard foi posto na rota sem
      // @Turnstile(). Recusa em vez de passar — e o log diz o que consertar.
      this.logger.error(
        'TurnstileGuard sem @Turnstile(action) na rota — recusando por segurança.',
      );
      throw new BadRequestException(MSG);
    }

    const req = context.switchToHttp().getRequest<RequestComToken>();
    // ⚠️ O guard roda ANTES do ValidationPipe, então este `body` é o cru. O token
    // não é confiado aqui: quem valida o formato é o TurnstileService (tipo e
    // tamanho) e, do lado do DTO, o @MaxLength do RegisterDto.
    const ok = await this.turnstile.verificar({
      token: req.body?.turnstileToken,
      action,
      ip: ipDoCliente(req),
    });
    if (!ok) throw new BadRequestException(MSG);
    return true;
  }
}
