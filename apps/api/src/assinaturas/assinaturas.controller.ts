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
  UseFilters,
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
import { AsaasExceptionFilter } from './asaas-exception.filter';
import { ReembolsoService, SituacaoReembolso } from './reembolso.service';
import { RefundRequest } from './refund-request.entity';
import { Assinatura } from './assinatura.entity';
import { Plano } from './precos';
import { AssinarCartaoDto } from './dto/assinar-cartao.dto';
import { CancelarAssinaturaDto } from './dto/cancelar-assinatura.dto';
import { CriarCheckoutDto } from './dto/criar-checkout.dto';
import { SolicitarReembolsoDto } from './dto/solicitar-reembolso.dto';
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
//
// ⚠️ O `AsaasExceptionFilter` é o que impede que TODA falha do Asaas vire 500 —
// e 500 aqui é especialmente ruim, porque o front traduz qualquer 5xx para
// "Instabilidade no servidor. Tente de novo em instantes.", mandando repetir o
// que não vai passar. Cartão recusado precisa dizer que foi recusado.
@UseFilters(AsaasExceptionFilter)
@UseGuards(JwtAuthGuard)
@Controller('assinaturas')
export class AssinaturasController {
  constructor(
    private readonly billing: StripeBillingService,
    private readonly asaas: AsaasBillingService,
    private readonly reembolso: ReembolsoService,
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
  // ⚠️ `IA` (30/min), NÃO `AUTH` (5/min). Isto é LEITURA do próprio estado, não
  // tentativa de credencial — o teto de brute-force não tinha o que fazer aqui.
  // Com 5/min, a tela estourava 429 ao reativar (ela relê a cada mudança de
  // estado), o front caía no `catch` e **renderizava o caminho da Stripe numa
  // conta do Asaas**. Bug real, visto pelo dono.
  @Throttle(THROTTLE.IA)
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
   * Troca de plano (T-216) — **sem proporcional em nenhum caso** (decisão do
   * dono, 30/07).
   *
   * ⚠️ A cobrança em aberto **pode ou não** ser reescrita, e quem decide é
   * `podeReescreverCobrancas` (só cartão, `PENDING` e vencendo no futuro). Isso
   * corrigiu o bug da reativação: a 1ª cobrança nasce adiada para o fim do
   * período já pago, e mantê-la no valor antigo obrigava quem pediu o anual a
   * comprar mais um mês mensal antes.
   *
   * A resposta traz `valeAPartirDe` **e** `cobrancaEmAbertoAtualizada` porque a
   * tela precisa distinguir os dois desfechos: no primeiro a data é a da
   * cobrança já reescrita, no segundo é a do ciclo seguinte. Trocar um texto
   * pelo outro faz o cliente esperar uma cobrança que não vai acontecer.
   */
  @Throttle(THROTTLE.AUTH)
  @UseGuards(UserThrottlerGuard)
  @Post('plano')
  @HttpCode(HttpStatus.OK)
  async trocarPlano(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CriarCheckoutDto,
  ): Promise<{
    plano: Plano;
    valeAPartirDe: Date | null;
    cobrancaEmAbertoAtualizada: boolean;
  }> {
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
      // ⚠️ Aqui SÓ passa boleto/Pix. Cartão tem rota própria
      // (`POST /assinaturas/assinar-cartao`), porque desde 01/08 a assinatura de
      // cartão é criada por NÓS e não por uma página hospedada — o checkout do
      // Asaas foi removido, e o porquê está no `criarAssinaturaComCartao`.
      const { pagarUrl } = await this.asaas.criarAssinaturaDireta(
        user.id,
        plano,
      );
      if (!pagarUrl) {
        throw new ServiceUnavailableException(
          'Não foi possível gerar a cobrança. Tente de novo em instantes.',
        );
      }
      // A URL é a página HOSPEDADA da 1ª cobrança — o pagador escolhe boleto ou
      // Pix ali. Não renderizamos linha digitável nem QR (T-216): nenhum
      // instrumento de pagamento passa por nós.
      return { url: pagarUrl };
    }
    return this.billing.criarCheckout(user.id, plano);
  }

  /**
   * Assina (ou REATIVA) com cartão — **Asaas apenas**. Épico 17.
   *
   * 🔴 RECEBE DADO DE CARTÃO, como o `PUT /cartao`. Mesmas invariantes, mesmo
   * escopo PCI (SAQ A-EP, decisão do dono em 31/07) — o cartão já passava pelo
   * nosso servidor desde então, isto não amplia nada.
   *
   * Substituiu o checkout hospedado, removido em 01/08: ele criava cliente e
   * assinatura por conta própria e nós só descobríamos depois, o que produziu
   * cliente fantasma, assinatura duplicada, CPF em vez do CNPJ na nota e a
   * reativação que nunca confirmava. O detalhe está em `criarAssinaturaComCartao`.
   */
  @Throttle(THROTTLE.AUTH)
  @UseGuards(UserThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('assinar-cartao')
  async assinarComCartao(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssinarCartaoDto,
    @Req() req: RequestComIp,
  ): Promise<{ ultimos4: string; bandeira: string }> {
    const { ultimos4, bandeira } = await this.asaas.criarAssinaturaComCartao(
      user.id,
      dto.plano ?? 'mensal',
      { cartao: dto.cartao, titular: dto.titular },
      ipDoClienteOuDesconhecido(req),
    );
    // ⚠️ O id da assinatura NÃO volta para a tela: é identificador do provedor,
    // não tem uso na UI, e vazá-lo só amplia superfície.
    return { ultimos4, bandeira };
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

  /**
   * O que a tela precisa saber sobre reembolso (T-218).
   *
   * ⚠️ Devolve a ELEGIBILIDADE, não um booleano "pode": a tela precisa dizer a
   * DATA em que o prazo acaba e se o meio de pagamento é estornável. "Você pode
   * pedir reembolso" sem a data faz o cliente descobrir o prazo tarde demais.
   */
  @Get('reembolso')
  situacaoReembolso(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SituacaoReembolso> {
    return this.reembolso.situacao(user.id);
  }

  /**
   * Solicita o reembolso. **Não estorna** — entra na fila do dono (decisão de
   * 04/08: toda solicitação passa por ele).
   *
   * ⚠️ Dentro dos 7 dias do CDC isso é DIREITO do cliente, e o passo manual é
   * operacional. A rota não promete devolução imediata justamente porque o
   * dinheiro só volta quando o provedor confirmar.
   */
  @Throttle(THROTTLE.AUTH)
  @UseGuards(UserThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('reembolso')
  solicitarReembolso(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SolicitarReembolsoDto,
  ): Promise<RefundRequest> {
    return this.reembolso.solicitar(user.id, dto.motivo);
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
