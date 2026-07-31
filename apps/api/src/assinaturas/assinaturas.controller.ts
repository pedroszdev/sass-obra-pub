import {
  Body,
  ServiceUnavailableException,
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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsaasBillingService, PortalAsaas } from './asaas-billing.service';
import { Assinatura } from './assinatura.entity';
import { Plano } from './precos';
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
  constructor(
    private readonly billing: StripeBillingService,
    private readonly asaas: AsaasBillingService,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
  ) {}

  /**
   * Dados do portal do assinante (T-216), **conforme quem cobra a conta**.
   *
   * Existe porque os dois provedores oferecem coisas diferentes: a Stripe tem
   * Customer Portal hospedado, o Asaas **não tem nenhum** (T-207). Em vez de o
   * front adivinhar, ele lê `temGestaoExterna` e escolhe entre "abrir o portal
   * do provedor" e "renderizar a nossa tela".
   *
   * ⚠️ Enquanto a conta for da Stripe (todas hoje, até a T-224), a resposta é a
   * de sempre e **nada muda para o usuário atual**.
   */
  @Throttle(THROTTLE.AUTH)
  @UseGuards(UserThrottlerGuard)
  @Get('portal')
  async dadosDoPortal(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PortalAsaas> {
    const assinatura = await this.assinaturas.findOne({
      where: { userId: user.id },
    });
    if (assinatura?.provider !== 'asaas') {
      // Stripe (ou trial, que não tem provider): a gestão é externa, e a URL
      // vem do `POST /assinaturas/portal` que já existe.
      return { cobrancas: [], temGestaoExterna: true };
    }
    return this.asaas.detalhesPortal(user.id);
  }

  /**
   * Troca de plano (T-216) — **vale na virada do ciclo, sem proporcional**
   * (decisão do dono, 30/07). A cobrança em aberto NÃO é reescrita.
   *
   * A resposta traz `valeAPartirDe` porque a tela precisa dizer a data junto do
   * nome do plano: sem ela, "plano anual" mente sobre a cobrança que segue no
   * valor antigo.
   */
  @Throttle(THROTTLE.AUTH)
  @UseGuards(UserThrottlerGuard)
  @Post('plano')
  @HttpCode(HttpStatus.OK)
  async trocarPlano(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CriarCheckoutDto,
  ): Promise<{ plano: Plano; valeAPartirDe: Date | null }> {
    return this.asaas.trocarPlano(user.id, dto.plano ?? 'mensal');
  }

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
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CriarCheckoutDto,
  ): Promise<{ url: string }> {
    const plano = dto.plano ?? 'mensal';
    const assinatura = await this.assinaturas.findOne({
      where: { userId: user.id },
    });
    // Provider-aware, mesma lógica do `GET /portal`. ⚠️ Quem está em TRIAL tem
    // `provider: null` e cai na Stripe — que é o correto até a T-224: o trial é
    // nosso e a conversão hoje ainda acontece lá.
    if (assinatura?.provider === 'asaas') {
      // ⚠️ DOIS CAMINHOS, e a escolha do usuário decide qual: o checkout
      // hospedado só aceita CARTÃO em recorrência (T-209), então boleto e Pix
      // vão pela assinatura direta. Sem este `if`, a decisão da T-208 (três
      // meios) fica presa no backend e a tela só oferece cartão.
      if (dto.meio === 'boleto_pix') {
        const { pagarUrl } = await this.asaas.criarAssinaturaDireta(
          user.id,
          plano,
        );
        if (!pagarUrl) {
          throw new ServiceUnavailableException(
            'Não foi possível gerar a cobrança. Tente de novo em instantes.',
          );
        }
        // A URL é a página HOSPEDADA da 1ª cobrança — o pagador escolhe boleto
        // ou Pix ali. O front redireciona igual ao checkout de cartão.
        return { url: pagarUrl };
      }
      // Cartão: checkout hospedado. Para quem JÁ é assinante, este mesmo caminho
      // é o de TROCAR CARTÃO — não existe rota PCI-limpa por API (T-207).
      return this.asaas.criarCheckout(user.id, plano);
    }
    return this.billing.criarCheckout(user.id, plano);
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
