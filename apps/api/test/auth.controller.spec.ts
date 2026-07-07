import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { LoginDto } from '../src/auth/dto/login.dto';
import {
  CookieRequest,
  CookieResponse,
  readRefreshCookie,
  REFRESH_COOKIE,
} from '../src/auth/refresh-cookie';

// Duplo do Response do Express só com o que o controller usa.
function fakeRes(): CookieResponse & {
  cookie: jest.Mock;
  clearCookie: jest.Mock;
} {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

function reqComCookie(token?: string): CookieRequest {
  return {
    headers: { cookie: token ? `${REFRESH_COOKIE}=${token}; outra=x` : undefined },
  };
}

describe('AuthController (cookie httpOnly — T-119a)', () => {
  let controller: AuthController;
  let auth: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  beforeEach(() => {
    auth = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };
    controller = new AuthController(auth as unknown as AuthService);
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
    auth.refresh.mockResolvedValue({ accessToken: 'acc2', refreshToken: 'ref2' });
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
