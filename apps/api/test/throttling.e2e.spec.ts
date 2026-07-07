import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  SkipThrottle,
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import { EmailThrottlerGuard } from '../src/common/throttling/email-throttler.guard';
import {
  THROTTLE,
  THROTTLE_GLOBAL,
} from '../src/common/throttling/throttle.config';

// Espelha o login real (T-104): throttle apertado por IP (guard global) + por
// email (EmailThrottlerGuard). Sem AuthService/DB — só o mecanismo de rate limit.
@Controller('t')
class RotasDeTeste {
  @Throttle(THROTTLE.AUTH)
  @UseGuards(EmailThrottlerGuard)
  @Post('login')
  login(): { ok: true } {
    return { ok: true };
  }

  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  @SkipThrottle()
  @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }
}

describe('Rate limiting ponta a ponta (T-104)', () => {
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [THROTTLE_GLOBAL] })],
      controllers: [RotasDeTeste],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    app.set('trust proxy', 1); // honra o X-Forwarded-For (como no Render)
    await app.listen(0);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (ip: string, email: string): Promise<number> =>
    fetch(`${base}/t/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email }),
    }).then((r) => r.status);

  const get = (rota: string, ip: string): Promise<number> =>
    fetch(`${base}/t/${rota}`, {
      headers: { 'x-forwarded-for': ip },
    }).then((r) => r.status);

  it('login barra na 6ª tentativa do mesmo IP+email (teto 5/min)', async () => {
    const ip = '10.0.0.1';
    for (let i = 0; i < 5; i++) {
      expect(await login(ip, 'a@x.com')).toBe(201);
    }
    expect(await login(ip, 'a@x.com')).toBe(429);
  });

  it('dimensão EMAIL: conta cheia barra mesmo vindo de outro IP', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await login('10.0.1.1', 'b@x.com')).toBe(201);
    }
    // IP novo, mas o balde do email b já está cheio → barra pela dimensão email.
    expect(await login('10.0.1.2', 'b@x.com')).toBe(429);
  });

  it('dimensão IP: IP cheio barra mesmo com email novo (anti-spraying)', async () => {
    const ip = '10.0.2.1';
    for (let i = 0; i < 5; i++) {
      expect(await login(ip, `c${i}@x.com`)).toBe(201);
    }
    // Email nunca visto, mas o balde do IP já está cheio → barra pela dimensão IP.
    expect(await login(ip, 'novo@x.com')).toBe(429);
  });

  it('rota comum usa o teto global frouxo (bem acima de 5)', async () => {
    const ip = '10.0.3.1';
    for (let i = 0; i < 20; i++) {
      expect(await get('open', ip)).toBe(200);
    }
  });

  it('/health é isento (@SkipThrottle) — nunca toma 429', async () => {
    const ip = '10.0.4.1';
    for (let i = 0; i < 120; i++) {
      expect(await get('health', ip)).toBe(200);
    }
  });
});
