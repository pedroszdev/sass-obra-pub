import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import { EmailVerification } from '../src/auth/email-verification.entity';
import { PasswordReset } from '../src/auth/password-reset.entity';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { MailService } from '../src/mail/mail.service';
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
    Pick<
      UsersService,
      | 'findByEmail'
      | 'findById'
      | 'create'
      | 'updatePasswordHash'
      | 'getMunicipiosPreferidos'
      | 'markEmailVerified'
    >
  >;
  // jest.Mock solto: tipar contra Repository força casar as sobrecargas de create/save.
  let refreshTokens: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync' | 'decode' | 'verify'>>;
  let passwordResets: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let emailVerifications: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let mail: { sendMail: jest.Mock };

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      getMunicipiosPreferidos: jest.fn().mockResolvedValue([]),
      markEmailVerified: jest.fn().mockResolvedValue(undefined),
    };
    refreshTokens = {
      create: jest.fn((entity: RefreshToken) => entity),
      save: jest.fn((entity: RefreshToken) => Promise.resolve(entity)),
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    passwordResets = {
      create: jest.fn((x: Record<string, unknown>) => x),
      save: jest.fn((x: Record<string, unknown>) => Promise.resolve(x)),
      findOne: jest.fn(),
    };
    emailVerifications = {
      create: jest.fn((x: Record<string, unknown>) => x),
      save: jest.fn((x: Record<string, unknown>) => Promise.resolve(x)),
      findOne: jest.fn(),
    };
    mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
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
      passwordResets as unknown as Repository<PasswordReset>,
      emailVerifications as unknown as Repository<EmailVerification>,
      mail as unknown as MailService,
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
        aceiteTermos: true,
      });

      const created = users.create.mock.calls[0][0];
      expect(created.passwordHash).not.toBe('senha-secreta');
      expect(created.termsAcceptedAt).toBeInstanceOf(Date); // aceite LGPD (T-102)
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
          aceiteTermos: true,
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

  describe('changePassword (T-89)', () => {
    it('troca a senha e revoga os refresh tokens quando a atual confere', async () => {
      const passwordHash = await cheapHash('senha-atual');
      users.findById.mockResolvedValue(buildUser({ id: 'u1', passwordHash }));

      await service.changePassword('u1', {
        currentPassword: 'senha-atual',
        newPassword: 'nova-senha-123',
      });

      const novoHash = users.updatePasswordHash.mock.calls[0][1];
      expect(novoHash).not.toBe('nova-senha-123');
      await expect(bcrypt.compare('nova-senha-123', novoHash)).resolves.toBe(
        true,
      );
      // Encerra as outras sessões.
      expect(refreshTokens.delete).toHaveBeenCalledWith({ userId: 'u1' });
    });

    it('rejeita quando a senha atual está errada (sem trocar nem revogar)', async () => {
      const passwordHash = await cheapHash('senha-atual');
      users.findById.mockResolvedValue(buildUser({ id: 'u1', passwordHash }));

      await expect(
        service.changePassword('u1', {
          currentPassword: 'errada',
          newPassword: 'nova-senha-123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
      expect(refreshTokens.delete).not.toHaveBeenCalled();
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

  describe('forgotPassword (T-101)', () => {
    it('e-mail inexistente: não gera token nem envia (anti-enumeração)', async () => {
      users.findByEmail.mockResolvedValue(null);
      await service.forgotPassword('nao@existe.com');
      expect(passwordResets.save).not.toHaveBeenCalled();
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('e-mail existente: guarda o hash do token e envia o link', async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      await service.forgotPassword('fulano@empresa.com');
      const salvo = passwordResets.save.mock.calls[0][0];
      expect(salvo.tokenHash).toEqual(expect.any(String));
      expect(salvo.usedAt).toBeNull();
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      // o link com o token cru vai no e-mail, nunca o hash guardado.
      const enviado = mail.sendMail.mock.calls[0][0];
      expect(enviado.to).toBe('fulano@empresa.com');
      expect(enviado.html).toContain('/redefinir-senha?token=');
    });
  });

  describe('resetPassword (T-101)', () => {
    it('token inválido → 400', async () => {
      passwordResets.findOne.mockResolvedValue(null);
      await expect(
        service.resetPassword('token-qualquer', 'novaSenha123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('token expirado → 400', async () => {
      passwordResets.findOne.mockResolvedValue({
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPassword('t', 'novaSenha123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('token já usado → 400', async () => {
      passwordResets.findOne.mockResolvedValue({
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 10000),
      });
      await expect(
        service.resetPassword('t', 'novaSenha123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('válido: troca a senha, marca usado e revoga refresh tokens', async () => {
      const registro = {
        userId: 'user-1',
        usedAt: null as Date | null,
        expiresAt: new Date(Date.now() + 10000),
      };
      passwordResets.findOne.mockResolvedValue(registro);
      await service.resetPassword('t', 'novaSenha123');
      expect(users.updatePasswordHash).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
      );
      expect(registro.usedAt).toBeInstanceOf(Date); // uso único
      expect(refreshTokens.delete).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });

  describe('verificação de e-mail (T-132)', () => {
    it('register manda o e-mail de verificação', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: CreateUserInput) =>
        Promise.resolve(buildUser(input)),
      );
      await service.register({
        email: 'novo@empresa.com',
        password: 'senha-secreta',
        name: 'Novo',
        uf: 'SC',
        aceiteTermos: true,
      });
      expect(emailVerifications.save).toHaveBeenCalledTimes(1);
      const enviado = mail.sendMail.mock.calls[0][0];
      expect(enviado.html).toContain('/verificar-email?token=');
    });

    it('verifyEmail token inválido → 400', async () => {
      emailVerifications.findOne.mockResolvedValue(null);
      await expect(service.verifyEmail('t')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('verifyEmail válido: marca verificado e o token como usado', async () => {
      const registro = {
        userId: 'user-1',
        usedAt: null as Date | null,
        expiresAt: new Date(Date.now() + 10000),
      };
      emailVerifications.findOne.mockResolvedValue(registro);
      await service.verifyEmail('t');
      expect(users.markEmailVerified).toHaveBeenCalledWith('user-1');
      expect(registro.usedAt).toBeInstanceOf(Date);
    });

    it('resendVerification: no-op se já verificado', async () => {
      users.findById.mockResolvedValue(
        buildUser({ emailVerifiedAt: new Date() }),
      );
      await service.resendVerification('user-1');
      expect(emailVerifications.save).not.toHaveBeenCalled();
    });
  });
});
