import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { User } from '../users/user.entity';
import { Assinatura } from './assinatura.entity';
import { compararPlanos, Plano, planoDoIntervalo, PrecoPlano } from './precos';
import { STRIPE_CLIENT } from './stripe.provider';

// Cobrança pela Stripe (BACKLOG T-128). Só a IDA: abrir o Checkout e o Portal.
// Quem escuta a Stripe de volta é o webhook (T-129) — ele é a fonte da verdade
// do pagamento. NADA aqui marca a assinatura como paga: um `success_url` não é
// prova de pagamento (o usuário pode digitá-lo na barra de endereços).
//
// As LEITURAS (preços, faturas, cartão) também vivem aqui (T-131). Elas vão à
// Stripe a cada exibição em vez de espelhar o dado no nosso banco: a Stripe é a
// fonte da verdade (§8), e um espelho dessincronizado mostraria ao cliente um
// preço ou um cartão que não são mais os dele.

/** Preços dos dois planos + a vantagem do anual, como a tela precisa. */
export interface PrecosResponse {
  mensal: PrecoPlano;
  anual: PrecoPlano;
  /** Centavos economizados no ano. `null` = o anual não compensa. */
  economiaAnual: number | null;
  /** Meses que o desconto anual paga. `null` = o anual não compensa. */
  mesesGratis: number | null;
}

export interface Fatura {
  id: string;
  data: Date;
  /** Centavos efetivamente cobrados. */
  valor: number;
  moeda: string;
  /** Status CRU da Stripe (`paid`, `open`, `void`...) — quem rotula é a tela. */
  status: string;
  /**
   * PDF da Stripe: é RECIBO/fatura, NÃO é NFS-e (§9 — a nota de serviço é
   * emitida fora do sistema, à mão). Rotular isto de "NF" prometeria ao cliente
   * um documento fiscal que ele não vai receber aqui.
   */
  reciboUrl: string | null;
}

export interface DetalhesAssinatura {
  /** Quando virou assinante (vem da Stripe, não temos coluna). Null no trial. */
  assinanteDesde: Date | null;
  cartao: { bandeira: string; ultimos4: string } | null;
  faturas: Fatura[];
}

// Preço muda raramente e a tela é aberta o tempo todo — mas um cache longo faria
// a tela anunciar um preço velho depois de uma mudança no Dashboard. 5 min é o
// meio-termo: corta a rajada de chamadas sem mentir por muito tempo.
const PRECOS_TTL_MS = 5 * 60 * 1000;

// Quantas faturas a tela lista. O histórico completo é o "Ver todas na Stripe".
const FATURAS_LIMITE = 12;

@Injectable()
export class StripeBillingService {
  private readonly logger = new Logger(StripeBillingService.name);
  private precosCache: { em: number; dados: PrecosResponse } | null = null;

  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe | null,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  private cliente(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Cobrança indisponível: STRIPE_SECRET_KEY não configurada.',
      );
    }
    return this.stripe;
  }

  // O price de cada plano (T-131). Ausente → 503, como o resto da cobrança: uma
  // integração opcional mal configurada nunca derruba o produto inteiro (§8).
  private priceIdDoPlano(plano: Plano): string {
    const chave =
      plano === 'anual' ? 'STRIPE_PRICE_ID_ANUAL' : 'STRIPE_PRICE_ID';
    const id = this.config.get<string>(chave)?.trim();
    if (!id) {
      throw new ServiceUnavailableException(
        `Cobrança indisponível: ${chave} não configurado.`,
      );
    }
    return id;
  }

  private get webOrigin(): string {
    return (
      this.config.get<string>('WEB_ORIGIN')?.trim().replace(/\/$/, '') ||
      'http://localhost:5173'
    );
  }

  // Abre o Checkout hospedado da Stripe e devolve a URL para o front redirecionar.
  async criarCheckout(userId: string, plano: Plano): Promise<{ url: string }> {
    const stripe = this.cliente();
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura) {
      throw new NotFoundException('Assinatura não encontrada');
    }
    const customerId = await this.garantirCustomer(userId, assinatura);

    try {
      const sessao = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: customerId,
          line_items: [{ price: this.priceIdDoPlano(plano), quantity: 1 }],
          // `client_reference_id` + metadata: é assim que o WEBHOOK (T-129) sabe
          // de quem é o pagamento. Descobrir pelo e-mail seria frágil — a pessoa
          // pode trocá-lo dentro do próprio Checkout.
          client_reference_id: userId,
          subscription_data: { metadata: { userId } },
          success_url: `${this.webOrigin}/assinatura?status=ok`,
          cancel_url: `${this.webOrigin}/assinatura?status=cancelado`,
          // SEM `payment_method_types` — de propósito. Passá-lo desliga os métodos
          // dinâmicos e derruba a conversão; quem escolhe os meios aceitos é a
          // configuração do Dashboard (hoje: só cartão).
          //
          // SEM `trial_period_days`: o trial já foi consumido no NOSSO lado
          // (T-127). Quem chega aqui decidiu pagar — repetir o trial daria 7 dias
          // de graça a mais para quem já os teve.
          //
          // SEM `automatic_tax`: o Stripe Tax não cobre o Brasil. Preço cheio,
          // imposto embutido (NFS-e é emitida fora do sistema — decisão do dono).
        },
        // Idempotência: um retry (nosso ou da rede) não pode abrir duas sessões
        // e, no limite, cobrar duas vezes.
        //
        // O PLANO ENTRA NA CHAVE (T-131) e não é decoração: sem ele, quem abrisse
        // o checkout no mensal, voltasse e escolhesse o anual receberia de volta
        // a MESMA sessão (a Stripe devolve a resposta original para uma chave já
        // usada) — e pagaria o plano que não escolheu.
        { idempotencyKey: `checkout:${userId}:${assinatura.id}:${plano}` },
      );

      if (!sessao.url) {
        throw new Error('Checkout criado sem URL');
      }
      return { url: sessao.url };
    } catch (erro) {
      capturarErro(erro, 'stripe.checkout', { userId });
      this.logger.error(`Falha ao criar Checkout: ${this.msg(erro)}`);
      throw new ServiceUnavailableException(
        'Não foi possível abrir o pagamento agora. Tente de novo em instantes.',
      );
    }
  }

  // Portal do cliente (hospedado pela Stripe): trocar cartão, ver faturas,
  // cancelar. É por isso que NÃO construímos telas de gestão de assinatura.
  async criarPortal(userId: string): Promise<{ url: string }> {
    const stripe = this.cliente();
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura?.stripeCustomerId) {
      // Quem nunca pagou não tem o que gerenciar — e o Portal exige um customer.
      throw new NotFoundException('Nenhuma assinatura para gerenciar.');
    }
    try {
      const sessao = await stripe.billingPortal.sessions.create({
        customer: assinatura.stripeCustomerId,
        return_url: `${this.webOrigin}/assinatura`,
      });
      return { url: sessao.url };
    } catch (erro) {
      capturarErro(erro, 'stripe.portal', { userId });
      this.logger.error(`Falha ao abrir o Portal: ${this.msg(erro)}`);
      throw new ServiceUnavailableException(
        'Não foi possível abrir a gestão da assinatura agora.',
      );
    }
  }

  // Os preços dos dois planos, lidos da Stripe (T-131). Cache curto: a tela é
  // aberta o tempo todo e o preço muda uma vez por ano.
  async listarPrecos(): Promise<PrecosResponse> {
    const agora = Date.now();
    if (this.precosCache && agora - this.precosCache.em < PRECOS_TTL_MS) {
      return this.precosCache.dados;
    }
    const [mensal, anual] = await Promise.all([
      this.buscarPreco('mensal'),
      this.buscarPreco('anual'),
    ]);
    const comparacao = compararPlanos(mensal, anual);
    const dados: PrecosResponse = {
      mensal,
      anual,
      economiaAnual: comparacao?.economiaAnual ?? null,
      mesesGratis: comparacao?.mesesGratis ?? null,
    };
    this.precosCache = { em: agora, dados };
    return dados;
  }

  private async buscarPreco(plano: Plano): Promise<PrecoPlano> {
    const priceId = this.priceIdDoPlano(plano);
    let price: Stripe.Price;
    try {
      price = await this.cliente().prices.retrieve(priceId);
    } catch (erro) {
      capturarErro(erro, 'stripe.precos', { plano, priceId });
      this.logger.error(`Falha ao ler o preço ${plano}: ${this.msg(erro)}`);
      throw new ServiceUnavailableException(
        'Não foi possível carregar os planos agora. Tente de novo em instantes.',
      );
    }

    // O price configurado É MESMO o do plano que dizemos? Trocar os dois ids no
    // painel é um erro de digitação silencioso: a tela venderia "anual" cobrando
    // mensal. Barrar aqui é melhor do que cobrar errado.
    const real = planoDoIntervalo(
      price.recurring?.interval,
      price.recurring?.interval_count ?? 1,
    );
    if (real !== plano) {
      capturarErro(
        new Error(
          `Price ${priceId} configurado como "${plano}" mas a recorrência é "${real ?? 'não recorrente'}"`,
        ),
        'stripe.precos.configErrada',
        { plano, priceId },
      );
      throw new ServiceUnavailableException(
        'Planos mal configurados. Estamos resolvendo.',
      );
    }
    // Preço sem valor fixo (tiered/por uso): não é o que vendemos, e mostrar 0
    // seria pior do que falhar.
    if (price.unit_amount == null) {
      throw new ServiceUnavailableException(
        'Planos mal configurados. Estamos resolvendo.',
      );
    }
    return {
      plano,
      priceId,
      valor: price.unit_amount,
      moeda: price.currency,
    };
  }

  /**
   * Faturas, cartão e "assinante desde" (T-131) — lidos da Stripe na hora.
   *
   * "Assinante desde" vem do `start_date` da assinatura em vez de uma coluna
   * nossa de propósito: uma coluna nova nasceria NULA para todo mundo que já
   * assinou e exigiria backfill, enquanto a Stripe já sabe a data e está certa
   * retroativamente.
   *
   * Quem está no trial ainda não tem `Customer` (T-127) — devolve vazio, não 404:
   * a tela de trial chama isto do mesmo jeito.
   */
  async detalhes(userId: string): Promise<DetalhesAssinatura> {
    const vazio: DetalhesAssinatura = {
      assinanteDesde: null,
      cartao: null,
      faturas: [],
    };
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura?.stripeCustomerId) return vazio;

    const stripe = this.cliente();
    try {
      const [sub, faturas] = await Promise.all([
        assinatura.stripeSubscriptionId
          ? stripe.subscriptions.retrieve(assinatura.stripeSubscriptionId, {
              expand: ['default_payment_method'],
            })
          : Promise.resolve(null),
        stripe.invoices.list({
          customer: assinatura.stripeCustomerId,
          limit: FATURAS_LIMITE,
        }),
      ]);

      return {
        assinanteDesde: sub ? new Date(sub.start_date * 1000) : null,
        cartao: await this.extrairCartao(sub, assinatura.stripeCustomerId),
        faturas: faturas.data
          // `draft` é fatura que a Stripe ainda está montando — mostrar ao
          // cliente uma cobrança que talvez nunca exista só gera susto.
          .filter((f) => f.status !== 'draft')
          .map((f) => ({
            id: f.id ?? '',
            data: new Date(f.created * 1000),
            valor: f.amount_paid || f.amount_due,
            moeda: f.currency,
            status: f.status ?? 'desconhecido',
            reciboUrl: f.invoice_pdf ?? null,
          })),
      };
    } catch (erro) {
      capturarErro(erro, 'stripe.detalhes', { userId });
      this.logger.error(`Falha ao ler detalhes: ${this.msg(erro)}`);
      throw new ServiceUnavailableException(
        'Não foi possível carregar seus dados de cobrança agora.',
      );
    }
  }

  // O cartão da assinatura; se ela não tiver um próprio, o padrão do cliente (é
  // onde o Portal grava a troca de cartão).
  private async extrairCartao(
    sub: Stripe.Subscription | null,
    customerId: string,
  ): Promise<{ bandeira: string; ultimos4: string } | null> {
    const doSub = sub?.default_payment_method;
    if (doSub && typeof doSub !== 'string' && doSub.card) {
      return { bandeira: doSub.card.brand, ultimos4: doSub.card.last4 };
    }
    const cliente = await this.cliente().customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (cliente.deleted) return null;
    const padrao = cliente.invoice_settings?.default_payment_method;
    if (padrao && typeof padrao !== 'string' && padrao.card) {
      return { bandeira: padrao.card.brand, ultimos4: padrao.card.last4 };
    }
    return null;
  }

  // UM Customer por usuário, nunca dois: reusa o que já está gravado. Sem isto,
  // cada tentativa de pagar criaria um cliente novo na Stripe e o histórico do
  // usuário ficaria espalhado por vários — um pesadelo de reconciliação.
  private async garantirCustomer(
    userId: string,
    assinatura: Assinatura,
  ): Promise<string> {
    if (assinatura.stripeCustomerId) return assinatura.stripeCustomerId;

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const customer = await this.cliente().customers.create(
      {
        email: user.email,
        name: user.name,
        // O `userId` acompanha o cliente na Stripe: o webhook e a reconciliação
        // (T-143) encontram o dono sem depender do e-mail.
        metadata: { userId },
      },
      { idempotencyKey: `customer:${userId}` },
    );
    await this.assinaturas.update(
      { id: assinatura.id },
      { stripeCustomerId: customer.id },
    );
    return customer.id;
  }

  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
