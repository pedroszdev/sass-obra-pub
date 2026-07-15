import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthController,
  NavRequest,
  RedirectResponse,
  tokenDoCallback,
} from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { LoginDto } from '../src/auth/dto/login.dto';
import { GOOGLE_NONCE_COOKIE } from '../src/auth/google/google-nonce-cookie';
import { GoogleVerifierService } from '../src/auth/google/google-verifier.service';
import {
  ACCESS_COOKIE,
  CookieRequest,
  readRefreshCookie,
  REFRESH_COOKIE,
} from '../src/auth/refresh-cookie';

// Duplo do Response do Express só com o que o controller usa.
function fakeRes(): RedirectResponse & {
  cookie: jest.Mock;
  clearCookie: jest.Mock;
  redirect: jest.Mock;
} {
  return { cookie: jest.fn(), clearCookie: jest.fn(), redirect: jest.fn() };
}

function reqComCookie(token?: string): CookieRequest {
  return {
    headers: {
      cookie: token ? `${REFRESH_COOKIE}=${token}; outra=x` : undefined,
    },
  };
}

function reqComNonce(nonce?: string): CookieRequest {
  return {
    headers: {
      cookie: nonce ? `${GOOGLE_NONCE_COOKIE}=${nonce}; outra=x` : undefined,
    },
  };
}

// Navegação de topo até a API (é assim que o /auth/google/start é alcançado):
// atrás do proxy do Render, o protocolo real vem no x-forwarded-proto.
function reqNav(): NavRequest {
  return {
    headers: { host: 'api.exemplo.com', 'x-forwarded-proto': 'https' },
  };
}

const config = (webOrigin?: string): ConfigService =>
  ({ get: jest.fn().mockReturnValue(webOrigin) }) as unknown as ConfigService;

describe('AuthController (cookie httpOnly — T-119a)', () => {
  let controller: AuthController;
  let auth: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    loginGoogleRedirect: jest.Mock;
  };
  // Verificador REAL (só o client id é dublê): a URL de consentimento é o que
  // mandamos ao Google, e testá-la contra um mock não provaria nada.
  const verificador = (clientId?: string) =>
    new GoogleVerifierService({
      get: jest.fn().mockReturnValue(clientId),
    } as unknown as ConfigService);

  beforeEach(() => {
    auth = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      loginGoogleRedirect: jest.fn(),
    };
    controller = new AuthController(
      auth as unknown as AuthService,
      config('https://app.exemplo.com'),
      verificador('client-123'),
    );
  });

  // T-155: NENHUM token no corpo. Os dois viram cookie httpOnly — o JS da página
  // não lê nenhum dos dois, então um XSS não encontra credencial para roubar.
  it('login seta os DOIS cookies httpOnly e não devolve token nenhum no corpo', async () => {
    auth.login.mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'ref',
      user: { id: 'u1' },
    });
    const res = fakeRes();

    const body = await controller.login(
      { email: 'a@b.c', password: 'x' } as unknown as LoginDto,
      res,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'ref',
      expect.objectContaining({ httpOnly: true, path: '/auth' }),
    );
    // O access precisa de path '/': ele autentica TODA rota, não só /auth.
    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      'acc',
      expect.objectContaining({
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      }),
    );
    expect(body).toEqual({ user: { id: 'u1' } });
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');
  });

  it('refresh rotaciona os dois cookies e devolve corpo vazio', async () => {
    auth.refresh.mockResolvedValue({
      accessToken: 'acc2',
      refreshToken: 'ref2',
    });
    const res = fakeRes();

    const body = await controller.refresh(reqComCookie('ref'), res);

    expect(auth.refresh).toHaveBeenCalledWith('ref');
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'ref2',
      expect.any(Object),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      'acc2',
      expect.any(Object),
    );
    expect(body).toBeUndefined();
  });

  it('refresh sem cookie → 401 (não chama o service)', async () => {
    await expect(
      controller.refresh(reqComCookie(), fakeRes()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('logout revoga o refresh do cookie e limpa o cookie', async () => {
    auth.logout.mockResolvedValue(undefined);
    const res = fakeRes();

    await controller.logout(reqComCookie('ref'), res);

    expect(auth.logout).toHaveBeenCalledWith('ref');
    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      expect.any(Object),
    );
  });

  it('logout sem cookie → só limpa o cookie (não chama o service)', async () => {
    const res = fakeRes();
    await controller.logout(reqComCookie(), res);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });

  // --- login com Google por redirect (T-126b) ---

  // O nonce é gravado AQUI, numa navegação de topo — é o que faz dele um cookie
  // primário. Se um dia isto virar um fetch do front, Safari e Firefox voltam a
  // descartar o cookie e o login quebra de novo.
  it('google/start grava o cookie do nonce e manda o navegador ao Google', () => {
    const res = fakeRes();

    controller.googleStart(reqNav(), res);

    const [nome, nonce, opts] = res.cookie.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(nome).toBe(GOOGLE_NONCE_COOKIE);
    expect(nonce).toHaveLength(32); // 24 bytes em base64url
    // SameSite=None + Secure é o que deixa o cookie voltar no POST cross-site
    // que o Google faz ao callback — com Lax ele não viria.
    expect(opts).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/auth',
    });

    const url = new URL((res.redirect.mock.calls[0] as [string])[0]);
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    // O mesmo nonce do cookie viaja ao Google e volta assinado dentro do token.
    expect(url.searchParams.get('nonce')).toBe(nonce);
    // id_token + form_post = o Google devolve o token direto no POST do callback,
    // sem troca de code (e por isso sem client secret).
    expect(url.searchParams.get('response_type')).toBe('id_token');
    expect(url.searchParams.get('response_mode')).toBe('form_post');
    // O redirect_uri sai do host real do pedido e precisa bater com o cadastrado
    // no Google Cloud Console.
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.exemplo.com/auth/google/callback',
    );
  });

  // Sem client id o verificador lança 503 — numa navegação isso viraria uma
  // página de erro crua. Vira a tela de login, com aviso.
  it('google/start sem GOOGLE_CLIENT_ID: volta ao login em vez de estourar', () => {
    const semGoogle = new AuthController(
      auth as unknown as AuthService,
      config('https://app.exemplo.com'),
      verificador(undefined),
    );
    const res = fakeRes();

    semGoogle.googleStart(reqNav(), res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://app.exemplo.com/login?erro=google',
    );
  });

  it('callback do Google: valida o nonce do cookie, seta o refresh e redireciona', async () => {
    auth.loginGoogleRedirect.mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'ref',
      user: { id: 'u1' },
    });
    const res = fakeRes();

    await controller.googleCallback(
      { id_token: 'idtok', authuser: '0', prompt: 'consent' },
      reqComNonce('n123'),
      res,
    );

    expect(auth.loginGoogleRedirect).toHaveBeenCalledWith('idtok', 'n123');
    // T-156: os cookies do REPASSE do Google precisam ser SameSite=None. Esta
    // resposta é a um POST cross-site do Google — um cookie Lax setado aqui é
    // descartado por Safari e afins, e o login com Google quebra. NÃO troque para
    // Lax achando que "unifica" com o resto: o contexto aqui é cross-site.
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'ref',
      expect.objectContaining({ httpOnly: true, sameSite: 'none', secure: true }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      'acc',
      expect.objectContaining({ httpOnly: true, sameSite: 'none', secure: true }),
    );
    // O nonce é de uso único.
    expect(res.clearCookie).toHaveBeenCalledWith(
      GOOGLE_NONCE_COOKIE,
      expect.any(Object),
    );
    expect(res.redirect).toHaveBeenCalledWith(
      'https://app.exemplo.com/entrando',
    );
  });

  // Sem o nonce que ESTA API sorteou, a resposta do Google não prova que o
  // fluxo começou aqui — é o que barra o login-CSRF. Nem chega ao service.
  it('callback do Google sem o cookie do nonce: não loga, volta ao login', async () => {
    const res = fakeRes();

    await controller.googleCallback({ id_token: 'idtok' }, reqComNonce(), res);

    expect(auth.loginGoogleRedirect).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://app.exemplo.com/login?erro=google',
    );
  });

  // Uma navegação de página não tem como receber JSON de erro: a falha vira
  // tela de login com aviso, e o motivo fica no log — nunca na URL.
  it('callback do Google com id_token recusado: volta ao login sem criar sessão', async () => {
    auth.loginGoogleRedirect.mockRejectedValue(
      new UnauthorizedException('Login com Google inválido'),
    );
    const res = fakeRes();

    await controller.googleCallback(
      { id_token: 'forjado' },
      reqComNonce('n123'),
      res,
    );

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://app.exemplo.com/login?erro=google',
    );
  });

  // Corpo sem token (ou com lixo no lugar dele) não pode virar 500 nem sessão.
  it('callback do Google sem token no corpo: volta ao login', async () => {
    const res = fakeRes();

    await controller.googleCallback(
      { authuser: '0' },
      reqComNonce('n123'),
      res,
    );

    expect(auth.loginGoogleRedirect).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://app.exemplo.com/login?erro=google',
    );
  });
});

// O corpo do callback é um formulário de TERCEIRO: o Google manda campos que não
// pedimos, e o nome do token muda com o fluxo (id_token no OIDC, credential no
// SDK). Ler o corpo cru — em vez de um DTO sob o ValidationPipe global — é o que
// impede o 400 "property ... should not exist" que já quebrou o login uma vez.
describe('tokenDoCallback (T-126b)', () => {
  it('lê o id_token do fluxo OIDC, ignorando o resto do formulário', () => {
    expect(
      tokenDoCallback({
        id_token: 'tok',
        authuser: '0',
        prompt: 'consent',
        campo_novo_do_google: 'x',
      }),
    ).toBe('tok');
  });

  it('ainda aceita `credential` (o nome que o SDK usa)', () => {
    expect(tokenDoCallback({ credential: 'tok' })).toBe('tok');
  });

  it('recusa corpo sem token, com token vazio ou absurdamente grande', () => {
    expect(() => tokenDoCallback({})).toThrow(UnauthorizedException);
    expect(() => tokenDoCallback({ id_token: '' })).toThrow(
      UnauthorizedException,
    );
    expect(() => tokenDoCallback({ id_token: 'x'.repeat(4097) })).toThrow(
      UnauthorizedException,
    );
  });
});

describe('readRefreshCookie', () => {
  it('extrai o token do header cookie', () => {
    expect(
      readRefreshCookie({
        headers: { cookie: `a=1; ${REFRESH_COOKIE}=meu.jwt; b=2` },
      }),
    ).toBe('meu.jwt');
  });

  it('null quando o cookie do refresh não está presente', () => {
    expect(readRefreshCookie({ headers: { cookie: 'a=1; b=2' } })).toBeNull();
    expect(readRefreshCookie({ headers: {} })).toBeNull();
  });
});
