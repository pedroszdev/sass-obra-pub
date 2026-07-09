import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';

// O cliente HTTP é o ponto mais arriscado do front (T-109): coalescência do
// refresh + retry no 401, e — desde a T-119 — refresh via cookie httpOnly, só
// deslogando em 401/403 real. Vitest roda em node, então stubamos localStorage
// (usado por auth.ts) e fetch.

const ACCESS_KEY = 'obrapub.accessToken';

const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
};

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

type FetchInit = { headers?: Record<string, string> };

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', fakeStorage);
});

describe('cliente HTTP — refresh + 401 (T-109/T-119)', () => {
  it('401 → refresh (cookie) → repete com o novo access token', async () => {
    store.set(ACCESS_KEY, 'old');
    const fetchMock = vi.fn((url: string, init: FetchInit) => {
      if (url.includes('/auth/refresh'))
        return Promise.resolve(res(200, { accessToken: 'new' }));
      if (init?.headers?.Authorization === 'Bearer new')
        return Promise.resolve(res(200, { ok: true }));
      return Promise.resolve(res(401, { message: 'expirado' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.apiGet('/data')).resolves.toEqual({ ok: true });
    // Guardou o novo access token; o refresh NÃO vai no corpo (vem no cookie).
    expect(store.get(ACCESS_KEY)).toBe('new');
    const refreshCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/auth/refresh'),
    );
    expect((refreshCall?.[1] as { body?: unknown })?.body).toBeUndefined();
  });

  it('coalescência: dois 401 concorrentes disparam UM único /auth/refresh', async () => {
    store.set(ACCESS_KEY, 'old');
    let refreshCalls = 0;
    const fetchMock = vi.fn((url: string, init: FetchInit) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls++;
        return Promise.resolve(res(200, { accessToken: 'new' }));
      }
      if (init?.headers?.Authorization === 'Bearer new')
        return Promise.resolve(res(200, { ok: true }));
      return Promise.resolve(res(401, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([api.apiGet('/a'), api.apiGet('/b')]);
    expect(refreshCalls).toBe(1);
  });

  it('erro de REDE no refresh mantém a sessão (não desloga)', async () => {
    store.set(ACCESS_KEY, 'old');
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/refresh'))
        return Promise.reject(new TypeError('network down'));
      return Promise.resolve(res(401, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.apiGet('/x')).rejects.toBeInstanceOf(api.ApiError);
    expect(store.get(ACCESS_KEY)).toBe('old'); // token preservado
  });

  it('401 REAL no refresh (cookie inválido) limpa o access token', async () => {
    store.set(ACCESS_KEY, 'old');
    const fetchMock = vi.fn(() => Promise.resolve(res(401, {})));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.apiGet('/x')).rejects.toBeInstanceOf(api.ApiError);
    expect(store.get(ACCESS_KEY)).toBeUndefined(); // deslogou
  });
});

describe('register (T-100)', () => {
  it('POST /auth/register com o payload e devolve o AuthResult', async () => {
    const user = { id: 'u1', email: 'a@b.com', name: 'Fulano', uf: 'SC' };
    let capturado: { url: string; init: FetchInit & { method?: string; body?: string } } | null = null;
    const fetchMock = vi.fn((url: string, init: FetchInit & { method?: string; body?: string }) => {
      capturado = { url, init };
      return Promise.resolve(res(201, { accessToken: 'acc', user }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await api.register({
      name: 'Fulano',
      email: 'a@b.com',
      password: 'senha1234',
      uf: 'SC',
      cnpj: '12345678000199',
      aceiteTermos: true,
    });

    expect(r.accessToken).toBe('acc');
    expect(r.user).toEqual(user);
    expect(capturado!.url).toContain('/auth/register');
    expect(capturado!.init.method).toBe('POST');
    expect(JSON.parse(capturado!.init.body as string)).toMatchObject({
      email: 'a@b.com',
      uf: 'SC',
      cnpj: '12345678000199',
    });
  });
});

describe('loginGoogle (T-126)', () => {
  it('POST /auth/google com o id_token e o aceite, sem exigir sessão', async () => {
    const user = { id: 'u1', email: 'a@b.com', name: 'Fulano', uf: null };
    let capturado: { url: string; init: FetchInit & { method?: string; body?: string } } | null = null;
    const fetchMock = vi.fn((url: string, init: FetchInit & { method?: string; body?: string }) => {
      capturado = { url, init };
      return Promise.resolve(res(200, { accessToken: 'acc', user }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await api.loginGoogle('id-token-do-google', true);

    expect(r.accessToken).toBe('acc');
    expect(capturado!.url).toContain('/auth/google');
    expect(capturado!.init.method).toBe('POST');
    expect(JSON.parse(capturado!.init.body as string)).toEqual({
      idToken: 'id-token-do-google',
      aceiteTermos: true,
    });
  });

  it('sem aceite (login de quem já tem conta) não manda o campo', async () => {
    let capturado: { init: { body?: string } } | null = null;
    const fetchMock = vi.fn((_url: string, init: { body?: string }) => {
      capturado = { init };
      return Promise.resolve(res(200, { accessToken: 'acc', user: {} }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.loginGoogle('tok');

    expect(JSON.parse(capturado!.init.body as string)).toEqual({ idToken: 'tok' });
  });
});

describe('excluirConta (T-102 + T-126)', () => {
  it('manda a senha quando a conta tem senha', async () => {
    let capturado: { init: { method?: string; body?: string } } | null = null;
    const fetchMock = vi.fn((_url: string, init: { method?: string; body?: string }) => {
      capturado = { init };
      return Promise.resolve(res(204, null));
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.excluirConta({ senha: 'minhaSenha' });

    expect(capturado!.init.method).toBe('DELETE');
    expect(JSON.parse(capturado!.init.body as string)).toEqual({ senha: 'minhaSenha' });
  });

  it('manda o id_token quando a conta é do Google (sem senha)', async () => {
    let capturado: { init: { body?: string } } | null = null;
    const fetchMock = vi.fn((_url: string, init: { body?: string }) => {
      capturado = { init };
      return Promise.resolve(res(204, null));
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.excluirConta({ idToken: 'tok-fresco' });

    // Nunca vaza um campo `senha: undefined` — o backend valida "um ou outro".
    expect(JSON.parse(capturado!.init.body as string)).toEqual({ idToken: 'tok-fresco' });
  });
});

describe('updateCompanyProfile (T-108)', () => {
  it('PUT /company-profile com o merge parcial', async () => {
    store.set(ACCESS_KEY, 'tok');
    let capturado: { url: string; init: FetchInit & { method?: string; body?: string } } | null = null;
    const fetchMock = vi.fn((url: string, init: FetchInit & { method?: string; body?: string }) => {
      capturado = { url, init };
      return Promise.resolve(res(200, { id: 'p1', capitalSocial: 320000 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const p = await api.updateCompanyProfile({ capitalSocial: 320000 });

    expect(p.capitalSocial).toBe(320000);
    expect(capturado!.url).toContain('/company-profile');
    expect(capturado!.init.method).toBe('PUT');
    expect(JSON.parse(capturado!.init.body as string)).toEqual({
      capitalSocial: 320000,
    });
  });
});
