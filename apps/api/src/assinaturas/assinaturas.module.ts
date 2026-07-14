import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assinatura } from './assinatura.entity';
import { AssinaturasService } from './assinaturas.service';

// Assinatura + trial (BACKLOG T-127). Sem Stripe ainda (T-128) e sem paywall
// (T-130) — por enquanto o backend só SABE dizer se o acesso está liberado.
@Module({
  imports: [TypeOrmModule.forFeature([Assinatura])],
  providers: [AssinaturasService],
  exports: [AssinaturasService],
})
export class AssinaturasModule {}
