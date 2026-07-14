import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { CaptacaoHealthIndicator } from './captacao.health';

// Isento do rate limit (T-104): keep-alive/monitoramento externo bate aqui de
// forma recorrente e não pode tomar 429 (ver §8 — pinger contra a hibernação).
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly captacao: CaptacaoHealthIndicator,
  ) {}

  // Liveness: o processo e o banco respondem. É o que o keep-alive/monitor bate.
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }

  // Saúde de DOMÍNIO (T-106): o servidor pode estar de pé com a captação parada
  // há dias — e aí o produto está morto enquanto o /health diz "ok". Aponte o
  // monitor externo AQUI, não só no /health.
  @Get('captacao')
  @HealthCheck()
  checkCaptacao() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.captacao.check(),
    ]);
  }
}
