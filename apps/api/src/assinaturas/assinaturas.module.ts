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
import { SubscriptionGuard } from './subscription.guard';

// Assinatura + trial (T-127) e cobrança pela Stripe (T-128). O paywall (T-130)
// e o webhook (T-129) ainda não existem.
@Module({
  imports: [TypeOrmModule.forFeature([Assinatura, User, StripeEvent])],
  controllers: [AssinaturasController, StripeWebhookController],
  providers: [
    AssinaturasService,
    StripeBillingService,
    StripeWebhookService,
    StripeClientProvider,
    SubscriptionGuard,
  ],
  exports: [AssinaturasService, SubscriptionGuard],
})
export class AssinaturasModule {}
