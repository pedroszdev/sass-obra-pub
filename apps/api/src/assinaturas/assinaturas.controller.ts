import {
  BadRequestException,
  Body,
  ServiceUnavailableException,
  Controller,
  Put,
  Req,
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
import { ipDoClienteOuDesconhecido, RequestComIp } from '../common/ip-cliente';
import { THROTTLE } from '../common/throttling/throttle.config';
import { UserThrottlerGuard } from '../common/throttling/user-throttler.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsaasBillingService, PortalAsaas } from './asaas-billing.service';
import { Assinatura } from './assinatura.entity';
import { Plano } from './precos';
import { CancelarAssinaturaDto } from './dto/cancelar-assinatura.dto';
import { CriarCheckoutDto } from './dto/criar-checkout.dto';
import { TrocarCartaoDto } from './dto/trocar-cartao.dto';
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

  /**
   * Cancelamento self-service (T-217). **Asaas apenas.**
   *
   * Provider-aware pelo mesmo motivo do `GET /portal`: quem é da Stripe cancela
   * no Customer Portal, que é o que roda em produção hoje (§8) — e o front já
   * manda essa pessoa para lá. Recusar aqui com texto claro é melhor que
   * silenciosamente não cancelar nada.
   *
   * ⚠️ Não confunda a resposta com "acabou o acesso": `acessoAte` é justamente o
   * contrário — até quando ele CONTINUA. Cancelar não corta na hora (T-144).
   */
  @Throttle(THROTTLE.AUTH)
  @UseGuards(UserThrottlerGuard)
  @Post('cancelar')
  @HttpCode(HttpStatus.OK)
  async cancelar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CancelarAssinaturaDto,
  ): Promise<{ canceladoEm: Date; acessoAte: Date | null }> {
    const assinatura = await this.assinaturas.findOne({
      where: { userId: user.id },
    });
    if (assinatura?.provider !== 'asaas') {
      throw new BadRequestException(
        'O cancelamento desta assinatura é feito no portal de pagamento.',
      );
    }
    return this.asaas.cancelar(user.id, dto.motivo, dto.detalhe);
  }

  // Preços dos planos (T-131), lidos da Stripe. Não é por usuário — mas segue
  // atrás do JWT: é a tela de assinatura de quem já entrou, não a vitrine.
  @Get('precos')
  async precos(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PrecosResponse> {
    // Provider-aware: a FORMA é a mesma, a FONTE não. Stripe lê o catálogo de
    // `Price`; Asaas lê o nosso config store, porque não tem catálogo (T-213).
    // Sem isto, uma conta do Asaas veria o preço da Stripe na tela — que é
    // exatamente o tipo de mentira que a regra do §8 existia para evitar.
    const assinatura = await this.assinaturas.findOne({
      where: { userId: user.id },
    });
    if (assinatura?.provider === 'asaas') {
      return this.asaas.listarPrecos();
    }
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

  /**
   * Troca o cartão da assinatura (Épico 17). **Asaas apenas.**
   *
   * 🔴 ESTA ROTA RECEBE DADO DE CARTÃO — o único ponto do sistema que recebe.
   * Decisão do dono (31/07): aceitar o escopo **PCI SAQ A-EP** em troca de ter
   * troca self-service; sem ela, cartão vencido deixava o cliente em `past_due`
   * sem saída, porque o Asaas não tem portal hospedado (T-207) e um checkout
   * novo criava assinatura duplicada (bug de 31/07).
   *
   * ⚠️ O corpo desta requisição NUNCA pode ser logado, persistido ou devolvido.
   * O `remoteIp` é exigência antifraude do Asaas e precisa ser o IP do CLIENTE —
   * usamos a função única da T-204, a mesma do rate limit e da auditoria.
   */
  @Throttle(THROTTLE.AUTH)
  @UseGuards(UserThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Put('cartao')
  async trocarCartao(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TrocarCartaoDto,
    @Req() req: RequestComIp,
  ): Promise<{ ultimos4: string; bandeira: string }> {
    return this.asaas.trocarCartao(
      user.id,
      { cartao: dto.cartao, titular: dto.titular },
      ipDoClienteOuDesconhecido(req),
    );
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
