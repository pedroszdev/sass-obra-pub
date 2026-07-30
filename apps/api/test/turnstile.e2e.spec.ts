import {
  Body,
  Controller,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ForgotPasswordDto } from '../src/auth/dto/forgot-password.dto';
import { RegisterDto } from '../src/auth/dto/register.dto';
import { Turnstile } from '../src/auth/turnstile/turnstile.decorator';
import { TurnstileGuard } from '../src/auth/turnstile/turnstile.guard';
import { TurnstileModule } from '../src/auth/turnstile/turnstile.module';

// Espelha o POST /auth/register real: mesmo guard, mesmo decorator, mesmo DTO e
// mesma ValidationPipe do main.ts — sem AuthService nem banco.
//
// Este e2e existe por um motivo específico: NENHUM teste do projeto boota o
// AuthModule, então uma falha de fiação (guard não exportado pelo TurnstileModule,
// Reflector não resolvido, DTO rejeitando o campo novo) não apareceria em teste
// nenhum — só no boot da API ou, pior, como "cadastro devolve 400" em produção.
@Controller('auth')
class RotaDeTeste {
  @UseGuards(TurnstileGuard)
  @Turnstile('register')
  @Post('register')
  register(@Body() dto: RegisterDto): { ok: true; email: string } {
    return { ok: true, email: dto.email };
  }

  // Segunda superfície protegida (T-203): serve para provar que a `action` é
  // POR ROTA e não global — um token emitido no cadastro não vale aqui.
  @UseGuards(TurnstileGuard)
  @Turnstile('forgot_password')
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto): { ok: true; email: string } {
    return { ok: true, email: dto.email };
  }
}

const CORPO = {
  email: 'fulano@empresa.com.br',
  password: 'Senha!Forte1',
  name: 'Fulano da Silva',
  uf: 'SP',
  // CNPJ obrigatório desde a T-225 — sem ele o DTO rejeita antes do Turnstile.
  cnpj: '11222333000181',
  aceiteTermos: true,
};

const WEB_ORIGIN = 'https://app.prumolicita.com.br';

describe('Turnstile no cadastro, ponta a ponta (T-203)', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  async function subir(env: Record<string, string>) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => env],
        }),
        TurnstileModule,
      ],
      controllers: [RotaDeTeste],
    }).compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    app.set('trust proxy', 1);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0);
    return app;
  }

  const postar = (base: string, body: unknown): Promise<Response> =>
    originalFetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    fetchMock.mockReset();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sem TURNSTILE_SECRET_KEY o cadastro passa sem token (degradação, §8)', async () => {
    const app = await subir({ WEB_ORIGIN });
    try {
      const r = await postar(await app.getUrl(), CORPO);
      expect(r.status).toBe(201);
    } finally {
      await app.close();
    }
  });

  describe('com a env presente', () => {
    const env = { WEB_ORIGIN, TURNSTILE_SECRET_KEY: 'segredo' };

    it('sem token → 400, e a mensagem NÃO diz o motivo', async () => {
      const app = await subir(env);
      try {
        // A app já está no ar; só agora o fetch é trocado, para não interferir
        // no bootstrap. O `postar` usa o fetch original de propósito.
        global.fetch = fetchMock as unknown as typeof fetch;
        const r = await postar(await app.getUrl(), CORPO);
        expect(r.status).toBe(400);
        const corpo = (await r.json()) as { message: string };
        expect(corpo.message).toMatch(/não é um robô/i);
        expect(corpo.message).not.toMatch(/token|hostname|turnstile/i);
        // Token ausente é barrado ANTES de gastar chamada à Cloudflare.
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('token válido → 201, e o DTO não rejeita o campo novo', async () => {
      const app = await subir(env);
      try {
        global.fetch = fetchMock.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              action: 'register',
              hostname: 'app.prumolicita.com.br',
            }),
        }) as unknown as typeof fetch;

        const r = await postar(await app.getUrl(), {
          ...CORPO,
          turnstileToken: 'token-bom',
        });
        expect(r.status).toBe(201);
        expect(await r.json()).toEqual({ ok: true, email: CORPO.email });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        await app.close();
      }
    });

    // ⚠️ O caso do backlog: token é de USO ÚNICO. O primeiro POST passa; o
    // segundo com o MESMO token é recusado pela Cloudflare
    // (`timeout-or-duplicate`) e tem de virar 400 aqui.
    it('token reenviado → 400 na segunda vez', async () => {
      const app = await subir(env);
      try {
        const base = await app.getUrl();
        global.fetch = fetchMock as unknown as typeof fetch;
        fetchMock
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                action: 'register',
                hostname: 'app.prumolicita.com.br',
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: false,
                'error-codes': ['timeout-or-duplicate'],
              }),
          });

        const body = { ...CORPO, turnstileToken: 'token-usado-duas-vezes' };
        expect((await postar(base, body)).status).toBe(201);
        expect((await postar(base, body)).status).toBe(400);
      } finally {
        await app.close();
      }
    });

    // ⚠️ O que a conferência de `action` compra, em teste: um token legítimo,
    // emitido de verdade no widget do CADASTRO, NÃO serve para disparar e-mail de
    // recuperação. Sem essa checagem uma superfície viraria oráculo da outra.
    it('token do cadastro NÃO vale no forgot-password (action por rota)', async () => {
      const app = await subir(env);
      try {
        global.fetch = fetchMock.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              action: 'register', // emitido na tela de cadastro
              hostname: 'app.prumolicita.com.br',
            }),
        }) as unknown as typeof fetch;

        const r = await originalFetch(
          `${await app.getUrl()}/auth/forgot-password`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              email: 'fulano@empresa.com.br',
              turnstileToken: 'token-do-cadastro',
            }),
          },
        );
        expect(r.status).toBe(400);
      } finally {
        await app.close();
      }
    });

    it('token com a action certa passa no forgot-password', async () => {
      const app = await subir(env);
      try {
        global.fetch = fetchMock.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              action: 'forgot_password',
              hostname: 'app.prumolicita.com.br',
            }),
        }) as unknown as typeof fetch;

        const r = await originalFetch(
          `${await app.getUrl()}/auth/forgot-password`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              email: 'fulano@empresa.com.br',
              turnstileToken: 'token-bom',
            }),
          },
        );
        expect(r.status).toBe(201);
      } finally {
        await app.close();
      }
    });

    it('Cloudflare fora do ar → 400 (fail-closed, decisão do dono)', async () => {
      const app = await subir(env);
      try {
        global.fetch = fetchMock.mockRejectedValue(
          new Error('timeout'),
        ) as unknown as typeof fetch;
        const r = await postar(await app.getUrl(), {
          ...CORPO,
          turnstileToken: 'token-bom',
        });
        expect(r.status).toBe(400);
      } finally {
        await app.close();
      }
    });
  });
});
