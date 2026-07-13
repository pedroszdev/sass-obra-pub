import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController, RedirectResponse } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { GoogleCallbackDto } from '../src/auth/dto/google-callback.dto';
import { LoginDto } from '../src/auth/dto/login.dto';
import { GOOGLE_NONCE_COOKIE } from '../src/auth/google/google-nonce-cookie';
import {
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
    );
  });

  it('login seta o cookie httpOnly do refresh e NÃO devolve refreshToken no corpo', async () => {
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
    expect(body).toEqual({ accessToken: 'acc', user: { id: 'u1' } });
    expect(body).not.toHaveProperty('refreshToken');
  });

  it('refresh lê o cookie, rotaciona e seta o novo cookie', async () => {
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
    expect(body).toEqual({ accessToken: 'acc2' });
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

  it('google/inicio sorteia o nonce, guarda no cookie e devolve o mesmo valor', () => {
    const res = fakeRes();

    const { nonce } = controller.googleInicio(res);

    expect(nonce).toHaveLength(32); // 24 bytes em base64url
    expect(res.cookie).toHaveBeenCalledWith(
      GOOGLE_NONCE_COOKIE,
      nonce,
      // SameSite=None + Secure é o que deixa o cookie voltar no POST cross-site
      // que o Google faz ao callback — com Lax ele não viria.
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/auth',
      }),
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
      { credential: 'idtok' } as GoogleCallbackDto,
      reqComNonce('n123'),
      res,
    );

    expect(auth.loginGoogleRedirect).toHaveBeenCalledWith('idtok', 'n123');
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'ref',
      expect.objectContaining({ httpOnly: true }),
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

    await controller.googleCallback(
      { credential: 'idtok' } as GoogleCallbackDto,
      reqComNonce(),
      res,
    );

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
      { credential: 'forjado' } as GoogleCallbackDto,
      reqComNonce('n123'),
      res,
    );

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://app.exemplo.com/login?erro=google',
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
