import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { TURNSTILE_ACTION_KEY } from '../src/auth/turnstile/turnstile.decorator';
import { TurnstileGuard } from '../src/auth/turnstile/turnstile.guard';
import {
  TurnstileService,
  avaliarSiteverify,
  hostnamesDe,
} from '../src/auth/turnstile/turnstile.service';

const APP = 'https://app.prumolicita.com.br';
const HOSTS = ['app.prumolicita.com.br'];

function build(env: Record<string, string> = {}) {
  const config = {
    get: jest.fn((k: string, def?: unknown) => env[k] ?? def),
  };
  return new TurnstileService(config as unknown as ConfigService);
}

describe('avaliarSiteverify (T-203)', () => {
  const esperado = { action: 'register', hostnames: HOSTS };

  it('aprova success + action + hostname corretos', () => {
    expect(
      avaliarSiteverify(
        { success: true, action: 'register', hostname: HOSTS[0] },
        esperado,
      ),
    ).toEqual({ ok: true });
  });

  it('recusa success: false e guarda os error-codes no detalhe (log, não cliente)', () => {
    const v = avaliarSiteverify(
      { success: false, 'error-codes': ['timeout-or-duplicate'] },
      esperado,
    );
    expect(v.ok).toBe(false);
    expect(v).toMatchObject({ detalhe: 'timeout-or-duplicate' });
  });

  it('recusa token de OUTRA ação, mesmo com success: true', () => {
    expect(
      avaliarSiteverify(
        { success: true, action: 'login', hostname: HOSTS[0] },
        esperado,
      ).ok,
    ).toBe(false);
  });

  it('recusa hostname de fora — o sitekey é público e está no bundle do front', () => {
    expect(
      avaliarSiteverify(
        { success: true, action: 'register', hostname: 'site-do-atacante.com' },
        esperado,
      ).ok,
    ).toBe(false);
  });

  it('recusa hostname ausente (não trata vazio como aprovado)', () => {
    expect(
      avaliarSiteverify({ success: true, action: 'register' }, esperado).ok,
    ).toBe(false);
  });

  // ⚠️ Resposta REAL do siteverify com o segredo de teste "sempre passa", medida
  // em 29/07 (a doc de testing diz hostname `localhost`; a resposta diz
  // `example.com`, e NÃO manda `action` nenhum). Sem a exceção pelo
  // `result_with_testing_key`, as chaves de teste recusariam tudo — justamente
  // as chaves feitas para exercitar a tela no navegador.
  it('chave de TESTE: aprova sem exigir action/hostname, e sinaliza', () => {
    const v = avaliarSiteverify(
      {
        success: true,
        hostname: 'example.com',
        'error-codes': [],
        metadata: { result_with_testing_key: true },
      },
      esperado,
    );
    expect(v).toEqual({ ok: true, chaveDeTeste: true });
  });

  it('chave de teste NÃO salva um success: false', () => {
    expect(
      avaliarSiteverify(
        {
          success: false,
          'error-codes': ['timeout-or-duplicate'],
          metadata: { result_with_testing_key: true },
        },
        esperado,
      ).ok,
    ).toBe(false);
  });

  it('metadata sem a flag não relaxa nada', () => {
    expect(
      avaliarSiteverify(
        { success: true, hostname: 'example.com', metadata: {} },
        esperado,
      ).ok,
    ).toBe(false);
  });
});

describe('hostnamesDe', () => {
  it('extrai o hostname do WEB_ORIGIN', () => {
    expect(hostnamesDe(APP)).toEqual(HOSTS);
  });

  it('em dev, o Vite', () => {
    expect(hostnamesDe('http://localhost:5173')).toEqual(['localhost']);
  });

  it('WEB_ORIGIN malformado → lista vazia (nada passa; não vira fail-open)', () => {
    expect(hostnamesDe('nao-e-url')).toEqual([]);
  });
});

describe('TurnstileService.verificar', () => {
  const fetchMock = jest.fn();
  const original = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = original;
  });

  const ok = (body: unknown) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

  const chamar = (
    service: TurnstileService,
    token: unknown,
    ip = '200.1.1.1',
  ) => service.verificar({ token, action: 'register', ip });

  it('sem TURNSTILE_SECRET_KEY: passa e NÃO chama a Cloudflare (degradação, §8)', async () => {
    const service = build({ WEB_ORIGIN: APP });
    expect(service.habilitado).toBe(false);
    await expect(chamar(service, undefined)).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('com a env presente (fail-closed)', () => {
    const env = { TURNSTILE_SECRET_KEY: 'segredo', WEB_ORIGIN: APP };

    it('token válido → passa, mandando secret, response e remoteip', async () => {
      const service = build(env);
      expect(service.habilitado).toBe(true);
      fetchMock.mockReturnValue(
        ok({ success: true, action: 'register', hostname: HOSTS[0] }),
      );

      await expect(chamar(service, 'token-bom')).resolves.toBe(true);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('challenges.cloudflare.com');
      const corpo = new URLSearchParams(init.body as string);
      expect(corpo.get('secret')).toBe('segredo');
      expect(corpo.get('response')).toBe('token-bom');
      expect(corpo.get('remoteip')).toBe('200.1.1.1');
    });

    it('sem IP conhecido, omite remoteip em vez de mandar vazio', async () => {
      const service = build(env);
      fetchMock.mockReturnValue(
        ok({ success: true, action: 'register', hostname: HOSTS[0] }),
      );
      await service.verificar({ token: 't', action: 'register', ip: null });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(new URLSearchParams(init.body as string).has('remoteip')).toBe(
        false,
      );
    });

    it.each([
      ['ausente', undefined],
      ['vazio', ''],
      ['não-string', 12345],
      ['gigante', 'x'.repeat(2049)],
    ])('token %s → recusa sem gastar chamada ao siteverify', async (_, t) => {
      const service = build(env);
      await expect(chamar(service, t)).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // ⚠️ O token é de USO ÚNICO: o reenvio do mesmo token é recusado pela
    // Cloudflare com `timeout-or-duplicate`. É o caso que o backlog manda cobrir.
    it('token reusado (timeout-or-duplicate) → recusa', async () => {
      const service = build(env);
      fetchMock.mockReturnValue(
        ok({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
      );
      await expect(chamar(service, 'token-reusado')).resolves.toBe(false);
    });

    it('Cloudflare fora do ar (rede/timeout) → RECUSA (fail-closed)', async () => {
      const service = build(env);
      fetchMock.mockRejectedValue(new Error('timeout'));
      await expect(chamar(service, 'token-bom')).resolves.toBe(false);
    });

    it('siteverify em 5xx → recusa', async () => {
      const service = build(env);
      fetchMock.mockReturnValue(
        Promise.resolve({ ok: false, status: 502, json: () => ({}) }),
      );
      await expect(chamar(service, 'token-bom')).resolves.toBe(false);
    });

    it('corpo não-JSON → recusa', async () => {
      const service = build(env);
      fetchMock.mockReturnValue(
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('not json')),
        }),
      );
      await expect(chamar(service, 'token-bom')).resolves.toBe(false);
    });

    it('WEB_ORIGIN inválido → recusa sem chamar a Cloudflare', async () => {
      const service = build({
        TURNSTILE_SECRET_KEY: 'segredo',
        WEB_ORIGIN: 'nao-e-url',
      });
      await expect(chamar(service, 'token-bom')).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

describe('TurnstileGuard', () => {
  function ctx(body: unknown, action: string | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn(() => action),
    } as unknown as Reflector;
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ body, ips: ['200.1.1.1'], headers: {} }),
      }),
    } as unknown as ExecutionContext;
    return { reflector, context };
  }

  it('token aceito → libera, e repassa a action do decorator', async () => {
    const turnstile = { verificar: jest.fn().mockResolvedValue(true) };
    const { reflector, context } = ctx({ turnstileToken: 'tk' }, 'register');
    const guard = new TurnstileGuard(
      reflector,
      turnstile as unknown as TurnstileService,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(turnstile.verificar).toHaveBeenCalledWith({
      token: 'tk',
      action: 'register',
      ip: '200.1.1.1',
    });
  });

  it('token recusado → 400 com mensagem genérica (não diz o motivo)', async () => {
    const turnstile = { verificar: jest.fn().mockResolvedValue(false) };
    const { reflector, context } = ctx({ turnstileToken: 'tk' }, 'register');
    const guard = new TurnstileGuard(
      reflector,
      turnstile as unknown as TurnstileService,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      /não é um robô/i, // nada de "token expirado" / "hostname" / "reusado"
    );
  });

  it('guard sem @Turnstile() na rota → recusa (erro de programação, fail-closed)', async () => {
    const turnstile = { verificar: jest.fn() };
    const { reflector, context } = ctx({ turnstileToken: 'tk' }, undefined);
    const guard = new TurnstileGuard(
      reflector,
      turnstile as unknown as TurnstileService,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(turnstile.verificar).not.toHaveBeenCalled();
  });

  it('body ausente não estoura — vira token undefined, que o service recusa', async () => {
    const turnstile = { verificar: jest.fn().mockResolvedValue(false) };
    const { reflector, context } = ctx(undefined, 'register');
    const guard = new TurnstileGuard(
      reflector,
      turnstile as unknown as TurnstileService,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(turnstile.verificar).toHaveBeenCalledWith(
      expect.objectContaining({ token: undefined }),
    );
  });
});

// O TURNSTILE_ACTION_KEY é contrato entre decorator e guard — se alguém renomear
// um lado só, a verificação passa a recusar tudo. Este teste é o alarme.
describe('contrato decorator ↔ guard', () => {
  it('a chave de metadata é a mesma dos dois lados', () => {
    expect(TURNSTILE_ACTION_KEY).toBe('turnstile_action');
  });
});
