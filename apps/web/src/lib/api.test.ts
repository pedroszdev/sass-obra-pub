import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';

// O cliente HTTP é o ponto mais arriscado do front (T-109): coalescência do
// refresh + retry no 401, só deslogando em 401/403 real.
//
// T-155: NÃO HÁ MAIS TOKEN NO JS. Os dois tokens são cookies httpOnly, que o
// navegador manda sozinho (`credentials: 'include'`) — o front nem os enxerga.
// O que sobra no localStorage é um MARCADOR de sessão (não é credencial: não dá
// acesso a nada; serve ao boot e ao logout entre abas).

const SESSAO_KEY = 'obrapub.sessao';

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

// Resposta 200 com corpo VAZIO — o que /auth/refresh devolve (só seta cookies).
// json() estoura (como o fetch real numa resposta vazia); text() vem ''.
function resVazio(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () =>
      Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

type FetchInit = { headers?: Record<string, string> };

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', fakeStorage);
});

describe('cliente HTTP — refresh + 401 (T-109/T-119/T-155)', () => {
  // O bug que quebrou o login com Google (T-156): /auth/refresh devolve 200 com
  // corpo VAZIO, e o response.json() direto estourava — a chamada falhava apesar
  // do 200, e o /entrando caía no catch antes do getMe.
  it('200 com corpo vazio (refresh) resolve, não estoura', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(resVazio(200)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.renovarSessao()).resolves.toBeUndefined();
  });

  it('401 → refresh (cookie) → repete a requisição', async () => {
    store.set(SESSAO_KEY, '1');
    let renovou = false;
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/refresh')) {
        renovou = true;
        return Promise.resolve(resVazio(200)); // 200 sem corpo; token vem no COOKIE
      }
      if (renovou) return Promise.resolve(res(200, { ok: true }));
      return Promise.resolve(res(401, { message: 'expirado' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.apiGet('/data')).resolves.toEqual({ ok: true });
    expect(store.get(SESSAO_KEY)).toBe('1');
  });

  // O ponto da T-155: nenhuma requisição carrega token no JS. A credencial é o
  // cookie httpOnly — que o navegador anexa por causa do `credentials: include`.
  it('NUNCA manda Authorization; manda credentials: include', async () => {
    let capturado: (FetchInit & { credentials?: string }) | null = null;
    const fetchMock = vi.fn(
      (_url: string, init: FetchInit & { credentials?: string }) => {
        capturado = init;
        return Promise.resolve(res(200, { ok: true }));
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.apiGet('/data');

    expect(capturado!.headers?.Authorization).toBeUndefined();
    expect(capturado!.credentials).toBe('include');
  });

  it('coalescência: dois 401 concorrentes disparam UM único /auth/refresh', async () => {
    store.set(SESSAO_KEY, '1');
    let refreshCalls = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls++;
        return Promise.resolve(res(200, null));
      }
      if (refreshCalls > 0) return Promise.resolve(res(200, { ok: true }));
      return Promise.resolve(res(401, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([api.apiGet('/a'), api.apiGet('/b')]);
    expect(refreshCalls).toBe(1);
  });

  it('erro de REDE no refresh mantém a sessão (não desloga)', async () => {
    store.set(SESSAO_KEY, '1');
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/refresh'))
        return Promise.reject(new TypeError('network down'));
      return Promise.resolve(res(401, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.apiGet('/x')).rejects.toBeInstanceOf(api.ApiError);
    expect(store.get(SESSAO_KEY)).toBe('1'); // sessão preservada
  });

  it('401 REAL no refresh (cookie inválido) encerra a sessão', async () => {
    store.set(SESSAO_KEY, '1');
    const fetchMock = vi.fn(() => Promise.resolve(res(401, {})));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.apiGet('/x')).rejects.toBeInstanceOf(api.ApiError);
    expect(store.get(SESSAO_KEY)).toBeUndefined(); // deslogou
  });
});

describe('register (T-100)', () => {
  it('POST /auth/register com o payload e devolve o AuthResult', async () => {
    const user = { id: 'u1', email: 'a@b.com', name: 'Fulano', uf: 'SC' };
    let capturado: { url: string; init: FetchInit & { method?: string; body?: string } } | null = null;
    const fetchMock = vi.fn((url: string, init: FetchInit & { method?: string; body?: string }) => {
      capturado = { url, init };
      return Promise.resolve(res(201, { user })); // T-155: sem token no corpo
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

    expect(r.user).toEqual(user);
    // T-155: o corpo NÃO traz token — ele vem no cookie httpOnly.
    expect(r).not.toHaveProperty('accessToken');
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
      return Promise.resolve(res(200, { user }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await api.loginGoogle('id-token-do-google', true);

    expect(r).not.toHaveProperty('accessToken');
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
      return Promise.resolve(res(200, { user: {} }));
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

describe('criarCheckout (T-131)', () => {
  // O bug que este teste tranca: `body` vai CRU (o rawRequest é quem serializa).
  // Um JSON.stringify aqui mandava uma string JSON dentro de JSON, e o Checkout
  // morria com "Unexpected token" antes de a pessoa conseguir pagar.
  it('POST /assinaturas/checkout com o plano em objeto, serializado UMA vez', async () => {
    store.set(SESSAO_KEY, '1');
    let capturado: { url: string; init: FetchInit & { method?: string; body?: string } } | null = null;
    const fetchMock = vi.fn((url: string, init: FetchInit & { method?: string; body?: string }) => {
      capturado = { url, init };
      return Promise.resolve(res(200, { url: 'https://checkout.stripe.com/s/1' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await api.criarCheckout('anual');

    expect(r.url).toBe('https://checkout.stripe.com/s/1');
    expect(capturado!.url).toContain('/assinaturas/checkout');
    expect(capturado!.init.method).toBe('POST');
    // Um parse só tem que bastar: se o corpo tivesse sido stringificado duas
    // vezes, isto devolveria a STRING '{"plano":"anual"}' em vez do objeto.
    expect(JSON.parse(capturado!.init.body as string)).toEqual({ plano: 'anual' });
  });

  it('sem plano → mensal (front velho em cache não quebra)', async () => {
    store.set(SESSAO_KEY, '1');
    let capturado: { init: FetchInit & { body?: string } } | null = null;
    const fetchMock = vi.fn((_url: string, init: FetchInit & { body?: string }) => {
      capturado = { init };
      return Promise.resolve(res(200, { url: 'https://checkout.stripe.com/s/2' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.criarCheckout();

    expect(JSON.parse(capturado!.init.body as string)).toEqual({ plano: 'mensal' });
  });
});

describe('updateCompanyProfile (T-108)', () => {
  it('PUT /company-profile com o merge parcial', async () => {
    store.set(SESSAO_KEY, '1');
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
