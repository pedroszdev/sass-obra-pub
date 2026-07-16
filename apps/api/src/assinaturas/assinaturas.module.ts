import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Assinatura } from './assinatura.entity';
import { AssinaturasController } from './assinaturas.controller';
import { AssinaturasService } from './assinaturas.service';
import { StripeBillingService } from './stripe-billing.service';
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
  imports: [TypeOrmModule.forFeature([Assinatura, User, StripeEvent])],
  controllers: [
    AssinaturasController,
    StripeWebhookController,
    ReconciliacaoController,
  ],
  providers: [
    AssinaturasService,
    StripeBillingService,
    StripeWebhookService,
    StripeClientProvider,
    SubscriptionGuard,
    ReconciliacaoService,
    ExclusaoInativosService,
  ],
  // StripeBillingService sai daqui para o aviso de renovação (T-158) ler o PREÇO
  // da Stripe — ele não pode vir do nosso banco (T-131), senão o e-mail anunciaria
  // um valor e o cartão seria debitado noutro.
  exports: [AssinaturasService, StripeBillingService, SubscriptionGuard],
})
export class AssinaturasModule {}
