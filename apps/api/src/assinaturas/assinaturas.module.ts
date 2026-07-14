import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Assinatura } from './assinatura.entity';
import { AssinaturasController } from './assinaturas.controller';
import { AssinaturasService } from './assinaturas.service';
import { StripeBillingService } from './stripe-billing.service';
import { StripeClientProvider } from './stripe.provider';

// Assinatura + trial (T-127) e cobrança pela Stripe (T-128). O paywall (T-130)
// e o webhook (T-129) ainda não existem.
@Module({
  imports: [TypeOrmModule.forFeature([Assinatura, User])],
  controllers: [AssinaturasController],
  providers: [AssinaturasService, StripeBillingService, StripeClientProvider],
  exports: [AssinaturasService],
})
export class AssinaturasModule {}
