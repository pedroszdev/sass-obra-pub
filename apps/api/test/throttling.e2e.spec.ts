import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SkipThrottle, Throttle, ThrottlerModule } from '@nestjs/throttler';
import { EmailThrottlerGuard } from '../src/common/throttling/email-throttler.guard';
import { IpThrottlerGuard } from '../src/common/throttling/ip-throttler.guard';
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

  // Espelha o reenvio de verificação (T-171): tier EMAIL, mais apertado.
  @Throttle(THROTTLE.EMAIL)
  @Post('email')
  email(): { ok: true } {
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
      providers: [{ provide: APP_GUARD, useClass: IpThrottlerGuard }],
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

  it('tier EMAIL barra na 3ª chamada do mesmo IP (teto 2/min — T-171)', async () => {
    const ip = '10.0.5.1';
    const email = (): Promise<number> =>
      fetch(`${base}/t/email`, {
        method: 'POST',
        headers: { 'x-forwarded-for': ip },
      }).then((r) => r.status);
    expect(await email()).toBe(201);
    expect(await email()).toBe(201);
    // Bem mais apertado que AUTH (5): dispara e-mail, spam é caro.
    expect(await email()).toBe(429);
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

  // T-204: o guard global passou a ler o IP pela função única do projeto.
  describe('IP atrás da Cloudflare (T-204)', () => {
    const original = process.env.TRUST_CF_CONNECTING_IP;
    afterEach(() => {
      if (original === undefined) delete process.env.TRUST_CF_CONNECTING_IP;
      else process.env.TRUST_CF_CONNECTING_IP = original;
    });

    const loginCf = (cf: string, xff: string, email: string): Promise<number> =>
      fetch(`${base}/t/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': xff,
          'cf-connecting-ip': cf,
        },
        body: JSON.stringify({ email }),
      }).then((r) => r.status);

    it('com a env ligada, o balde segue o CF-Connecting-IP e IGNORA o XFF forjado', async () => {
      process.env.TRUST_CF_CONNECTING_IP = 'true';
      const cf = '10.0.6.1';
      // XFF diferente a cada tentativa: é o que um atacante injetaria para
      // trocar de balde. Não deve adiantar nada.
      for (let i = 0; i < 5; i++) {
        expect(await loginCf(cf, `1.2.3.${i}`, `d${i}@x.com`)).toBe(201);
      }
      expect(await loginCf(cf, '1.2.3.99', 'outro@x.com')).toBe(429);
    });

    it('com a env desligada, o CF-Connecting-IP não tem efeito algum', async () => {
      delete process.env.TRUST_CF_CONNECTING_IP;
      // Mesmo CF-Connecting-IP nas duas, XFF distinto → baldes distintos, porque
      // o header da Cloudflare está sendo ignorado (comportamento de antes).
      expect(await loginCf('10.0.7.9', '10.0.7.1', 'e1@x.com')).toBe(201);
      expect(await loginCf('10.0.7.9', '10.0.7.2', 'e2@x.com')).toBe(201);
    });
  });

  // ⚠️ REGRESSÃO DE UMA ARMADILHA REAL (T-204). A forma "óbvia" de centralizar o
  // IP seria passar `getTracker` no `ThrottlerModule.forRoot`. O construtor do
  // ThrottlerGuard faz `commonOptions.getTracker ??= this.getTracker.bind(this)`,
  // então um getTracker no módulo SUBSTITUI o método das subclasses — e os
  // trackers por email e por usuário virariam por IP, em silêncio, matando a
  // dimensão que barra brute-force de uma conta por IPs rotativos.
  //
  // Este teste falha se alguém "simplificar" para o getTracker de módulo.
  it('o guard global por IP NÃO rouba o tracker por email do EmailThrottlerGuard', async () => {
    // Cinco tentativas na mesma conta, cada uma de um IP diferente: nenhum balde
    // de IP chega a 5, então só a dimensão EMAIL pode barrar a sexta.
    for (let i = 0; i < 5; i++) {
      expect(await login(`10.0.8.${i}`, 'vitima@x.com')).toBe(201);
    }
    expect(await login('10.0.8.200', 'vitima@x.com')).toBe(429);
  });
});
