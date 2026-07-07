import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

// Isento do rate limit (T-104): keep-alive/monitoramento externo bate aqui de
// forma recorrente e não pode tomar 429 (ver §8 — pinger contra a hibernação).
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    // Só responde "ok" se o Postgres responder ao ping.
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
