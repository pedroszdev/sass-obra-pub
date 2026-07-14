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
import { STRIPE_CLIENT } from './stripe.provider';

// Cobrança pela Stripe (BACKLOG T-128). Só a IDA: abrir o Checkout e o Portal.
// Quem escuta a Stripe de volta é o webhook (T-129) — ele é a fonte da verdade
// do pagamento. NADA aqui marca a assinatura como paga: um `success_url` não é
// prova de pagamento (o usuário pode digitá-lo na barra de endereços).

@Injectable()
export class StripeBillingService {
  private readonly logger = new Logger(StripeBillingService.name);

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

  private get priceId(): string {
    const id = this.config.get<string>('STRIPE_PRICE_ID')?.trim();
    if (!id) {
      throw new ServiceUnavailableException(
        'Cobrança indisponível: STRIPE_PRICE_ID não configurado.',
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
  async criarCheckout(userId: string): Promise<{ url: string }> {
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
          line_items: [{ price: this.priceId, quantity: 1 }],
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
        { idempotencyKey: `checkout:${userId}:${assinatura.id}` },
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
