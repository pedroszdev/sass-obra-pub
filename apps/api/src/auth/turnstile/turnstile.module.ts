import { Module } from '@nestjs/common';
import { TurnstileGuard } from './turnstile.guard';
import { TurnstileService } from './turnstile.service';

// Turnstile (T-203). Módulo próprio pelo mesmo motivo do GoogleAuthModule: é uma
// integração externa opcional, com degradação própria, e fica isolada do resto
// do auth. Sem TURNSTILE_SECRET_KEY o serviço fica inerte (ver o service).
@Module({
  providers: [TurnstileService, TurnstileGuard],
  exports: [TurnstileService, TurnstileGuard],
})
export class TurnstileModule {}
