import {
  ACCESS_COOKIE,
  clearAccessCookie,
  CookieResponse,
  readAccessCookie,
  setAccessCookie,
} from '../src/auth/refresh-cookie';

// T-155: o access token saiu do localStorage e virou cookie httpOnly. Estes
// testes travam os três atributos de que a segurança depende — se algum cair, ou
// o XSS volta a poder roubar a sessão, ou o CSRF abre.
function fakeRes() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as CookieResponse & {
    cookie: jest.Mock;
    clearCookie: jest.Mock;
  };
}

const opts = (res: { cookie: jest.Mock }) =>
  res.cookie.mock.calls[0][2] as Record<string, unknown>;

describe('cookie do access token (T-155)', () => {
  const NODE_ENV = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = NODE_ENV;
  });

  // httpOnly é o ponto da task inteira: o JS da página não lê o cookie, então um
  // XSS não encontra credencial para roubar.
  it('é httpOnly', () => {
    const res = fakeRes();
    setAccessCookie(res, 'token');
    expect(opts(res).httpOnly).toBe(true);
  });

  // O access autentica TODA rota (/editais, /propostas...), não só as de /auth —
  // com o path errado ele simplesmente não seria enviado e ninguém logaria.
  it('vale para todas as rotas (path /)', () => {
    const res = fakeRes();
    setAccessCookie(res, 'token');
    expect(opts(res).path).toBe('/');
  });

  // Autenticação por cookie é anexada pelo navegador sozinha — inclusive em
  // requisição vinda de OUTRO site. `Lax` é o que fecha o CSRF que a T-155 abriu.
  it('é SameSite=Lax (sem isto, a troca de XSS por CSRF sai no prejuízo)', () => {
    const res = fakeRes();
    setAccessCookie(res, 'token');
    expect(opts(res).sameSite).toBe('lax');
  });

  it('Secure em produção; sem Secure em dev (http do localhost)', () => {
    process.env.NODE_ENV = 'production';
    const prod = fakeRes();
    setAccessCookie(prod, 'token');
    expect(opts(prod).secure).toBe(true);

    process.env.NODE_ENV = 'development';
    const dev = fakeRes();
    setAccessCookie(dev, 'token');
    expect(opts(dev).secure).toBe(false);
  });

  it('expira em 15 min (o mesmo do JWT_ACCESS_EXPIRES)', () => {
    const res = fakeRes();
    setAccessCookie(res, 'token');
    expect(opts(res).maxAge).toBe(15 * 60 * 1000);
  });

  it('é lido de volta do header Cookie', () => {
    expect(
      readAccessCookie({
        headers: { cookie: `outro=x; ${ACCESS_COOKIE}=abc.def.ghi; z=1` },
      }),
    ).toBe('abc.def.ghi');
  });

  it('sem cookie → null (não explode)', () => {
    expect(readAccessCookie({ headers: {} })).toBeNull();
  });

  // O logout precisa limpar com o MESMO path, senão o navegador mantém o cookie.
  it('logout limpa com o mesmo path', () => {
    const res = fakeRes();
    clearAccessCookie(res);
    const [nome, o] = res.clearCookie.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(nome).toBe(ACCESS_COOKIE);
    expect(o.path).toBe('/');
  });
});
