import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { CreateUserInput, UsersService } from '../src/users/users.service';
import { User } from '../src/users/user.entity';
import { UserRole } from '../src/users/user-role.enum';

// Hash bcrypt barato (rounds baixos) para manter os testes rápidos.
const cheapHash = (plain: string): Promise<string> => bcrypt.hash(plain, 4);

const buildUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'fulano@empresa.com',
    passwordHash: 'hash',
    name: 'Fulano',
    cnpj: null,
    porte: null,
    uf: 'SC',
    role: UserRole.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'findById' | 'create'>
  >;
  // jest.Mock solto: tipar contra Repository força casar as sobrecargas de create/save.
  let refreshTokens: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync' | 'decode' | 'verify'>>;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    refreshTokens = {
      create: jest.fn((entity: RefreshToken) => entity),
      save: jest.fn((entity: RefreshToken) => Promise.resolve(entity)),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      decode: jest
        .fn()
        .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      verify: jest.fn().mockReturnValue({ sub: 'user-1', role: UserRole.USER }),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('secret'),
      get: jest.fn((_key: string, fallback: string) => fallback),
    };

    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      refreshTokens as unknown as Repository<RefreshToken>,
    );
  });

  describe('register', () => {
    it('faz hash da senha, cria o usuário e devolve tokens sem expor o hash', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: CreateUserInput) =>
        Promise.resolve(buildUser(input)),
      );

      const result = await service.register({
        email: 'fulano@empresa.com',
        password: 'senha-secreta',
        name: 'Fulano',
        uf: 'SC',
      });

      const created = users.create.mock.calls[0][0];
      expect(created.passwordHash).not.toBe('senha-secreta');
      await expect(
        bcrypt.compare('senha-secreta', created.passwordHash),
      ).resolves.toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).not.toHaveProperty('passwordHash');
      // Persistiu o refresh token (para rotação/revogação).
      expect(refreshTokens.save).toHaveBeenCalledTimes(1);
    });

    it('rejeita e-mail já cadastrado', async () => {
      users.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.register({
          email: 'fulano@empresa.com',
          password: 'senha-secreta',
          name: 'Fulano',
          uf: 'SC',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('aceita a senha correta e devolve tokens', async () => {
      const passwordHash = await cheapHash('senha-secreta');
      users.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      const result = await service.login({
        email: 'fulano@empresa.com',
        password: 'senha-secreta',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('rejeita senha incorreta', async () => {
      const passwordHash = await cheapHash('senha-secreta');
      users.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      await expect(
        service.login({ email: 'fulano@empresa.com', password: 'errada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita usuário inexistente', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ninguem@empresa.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const futureExpiry = (): Date => new Date(Date.now() + 3600 * 1000);

    it('rotaciona: revoga o token usado e emite um novo par', async () => {
      const stored = {
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: futureExpiry(),
        revoked: false,
      } as RefreshToken;
      refreshTokens.findOne.mockResolvedValue(stored);
      users.findById.mockResolvedValue(buildUser());

      const result = await service.refresh('refresh.jwt.token');

      expect(stored.revoked).toBe(true);
      expect(refreshTokens.save).toHaveBeenCalledWith(stored);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('rejeita refresh token revogado', async () => {
      refreshTokens.findOne.mockResolvedValue({
        revoked: true,
        expiresAt: futureExpiry(),
      } as RefreshToken);

      await expect(service.refresh('refresh.jwt.token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejeita refresh token desconhecido (reuso/inexistente)', async () => {
      refreshTokens.findOne.mockResolvedValue(null);

      await expect(service.refresh('refresh.jwt.token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejeita refresh token expirado', async () => {
      refreshTokens.findOne.mockResolvedValue({
        revoked: false,
        expiresAt: new Date(Date.now() - 1000),
      } as RefreshToken);

      await expect(service.refresh('refresh.jwt.token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revoga o refresh token informado', async () => {
      await service.logout('refresh.jwt.token');

      expect(refreshTokens.update).toHaveBeenCalledWith(
        { tokenHash: expect.any(String) },
        { revoked: true },
      );
    });
  });
});
