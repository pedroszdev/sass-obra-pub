import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigStoreModule } from '../config/config-store.module';
import { MailModule } from '../mail/mail.module';
import { User } from '../users/user.entity';
import { Assinatura } from './assinatura.entity';
import { AssinaturasController } from './assinaturas.controller';
import { AssinaturasService } from './assinaturas.service';
import { StripeBillingService } from './stripe-billing.service';
import { AsaasBillingService } from './asaas-billing.service';
import { AsaasEvent } from './asaas-event.entity';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { AsaasWebhookService } from './asaas-webhook.service';
import { AsaasClientProvider } from './asaas.provider';
import { StripeEvent } from './stripe-event.entity';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeClientProvider } from './stripe.provider';
import { ExclusaoInativosService } from './exclusao-inativos.service';
import { ReconciliacaoController } from './reconciliacao.controller';
import { ReconciliacaoService } from './reconciliacao.service';
import { SubscriptionGuard } from './subscription.guard';

// Assinatura + trial (T-127) e cobrança pela Stripe (T-128). O paywall (T-130)
// e o webhook (T-129) ainda não existem.
@Module({
  imports: [
    TypeOrmModule.forFeature([Assinatura, User, StripeEvent, AsaasEvent]),
    ConfigStoreModule, // dias de trial editáveis (T-195)
    MailModule, // confirmação de cancelamento (T-217)
  ],
  controllers: [
    AssinaturasController,
    StripeWebhookController,
    AsaasWebhookController,
    ReconciliacaoController,
  ],
  providers: [
    AssinaturasService,
    StripeBillingService,
    StripeWebhookService,
    StripeClientProvider,
    // Asaas (Épico 17) — convive com a Stripe até o corte (T-224). Nenhum
    // controller o chama ainda: T-212 entrega só o cliente.
    AsaasBillingService,
    AsaasWebhookService,
    AsaasClientProvider,
    SubscriptionGuard,
    ReconciliacaoService,
    ExclusaoInativosService,
  ],
  // StripeBillingService sai daqui para o aviso de renovação (T-158) ler o PREÇO
  // da Stripe — ele não pode vir do nosso banco (T-131), senão o e-mail anunciaria
  // um valor e o cartão seria debitado noutro.
  exports: [
    AssinaturasService,
    StripeBillingService,
    SubscriptionGuard,
    // Exposto para o admin disparar o "replay" (reconciliar uma assinatura, T-192).
    ReconciliacaoService,
  ],
})
export class AssinaturasModule {}
