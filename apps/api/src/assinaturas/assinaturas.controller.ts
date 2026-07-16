import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { THROTTLE } from '../common/throttling/throttle.config';
import { UserThrottlerGuard } from '../common/throttling/user-throttler.guard';
import { CriarCheckoutDto } from './dto/criar-checkout.dto';
import {
  DetalhesAssinatura,
  PrecosResponse,
  StripeBillingService,
} from './stripe-billing.service';

// Cobrança (BACKLOG T-128). Só a IDA para a Stripe — quem escuta a volta é o
// webhook (T-129), e é ELE quem marca a assinatura como paga. Nenhuma rota aqui
// altera o status: o retorno do navegador não é prova de pagamento.
//
// Estas rotas ficam FORA do paywall (T-130): trancar o caminho de pagar seria
// trancar o usuário numa porta sem maçaneta.
@UseGuards(JwtAuthGuard)
@Controller('assinaturas')
export class AssinaturasController {
  constructor(private readonly billing: StripeBillingService) {}

  // Preços dos planos (T-131), lidos da Stripe. Não é por usuário — mas segue
  // atrás do JWT: é a tela de assinatura de quem já entrou, não a vitrine.
  @Get('precos')
  precos(): Promise<PrecosResponse> {
    return this.billing.listarPrecos();
  }

  // Faturas, cartão e "assinante desde" (T-131). Throttle por usuário: cada
  // chamada fala com a Stripe.
  @Throttle(THROTTLE.IA)
  @UseGuards(UserThrottlerGuard)
  @Get('detalhes')
  detalhes(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DetalhesAssinatura> {
    return this.billing.detalhes(user.id);
  }

  // Abre o Checkout e devolve a URL — o front redireciona. Throttle por usuário:
  // cada chamada fala com a Stripe.
  @Throttle(THROTTLE.IA)
  @UseGuards(UserThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CriarCheckoutDto,
  ): Promise<{ url: string }> {
    return this.billing.criarCheckout(user.id, dto.plano ?? 'mensal');
  }

  // Portal do cliente (trocar cartão, faturas, cancelar) — hospedado pela Stripe.
  @Throttle(THROTTLE.IA)
  @UseGuards(UserThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('portal')
  portal(@CurrentUser() user: AuthenticatedUser): Promise<{ url: string }> {
    return this.billing.criarPortal(user.id);
  }
}
