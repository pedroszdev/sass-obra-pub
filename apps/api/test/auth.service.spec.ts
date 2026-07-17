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
import { GoogleVerifierService } from '../src/auth/google/google-verifier.service';
import { AssinaturasService } from '../src/assinaturas/assinaturas.service';
import { PasswordReset } from '../src/auth/password-reset.entity';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { MailService } from '../src/mail/mail.service';
import { AuthProvider } from '../src/users/auth-provider.enum';
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
      | 'findByGoogleSub'
      | 'linkGoogleSub'
    >
  >;
  let google: { verificar: jest.Mock };
  let assinaturas: { iniciarTrial: jest.Mock };
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
      findByGoogleSub: jest.fn().mockResolvedValue(null),
      linkGoogleSub: jest.fn(),
    };
    google = { verificar: jest.fn() };
    assinaturas = { iniciarTrial: jest.fn().mockResolvedValue(undefined) };
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
      google as unknown as GoogleVerifierService,
      assinaturas as unknown as AssinaturasService,
    );
  });

  describe('register', () => {
    // O envio de e-mail era AGUARDADO aqui. Com o provedor pendurado (o Render
    // free bloqueia as portas de SMTP), a requisição do cadastro nunca respondia:
    // a conta era criada e o usuário via a tela girando para sempre, sem saber.
    // O cadastro não pode depender do provedor de e-mail para responder.
    it('responde mesmo com o envio de e-mail pendurado (não espera o provedor)', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: CreateUserInput) =>
        Promise.resolve(buildUser(input)),
      );
      // Envio que NUNCA resolve — o provedor fora do ar / porta bloqueada.
      mail.sendMail.mockReturnValue(new Promise(() => {}));

      // SEM corrida contra o relógio: o mock que nunca resolve JÁ é o
      // instrumento. Se o register voltar a aguardar o envio, este await não
      // resolve nunca e o timeout do próprio jest reprova o teste — mesmo sinal,
      // sem prazo arbitrário.
      //
      // Havia um `Promise.race` com 1s aqui, e ele era FLAKY: o register faz
      // bcrypt (12 rounds), que é CPU pura e, sob os workers paralelos do jest,
      // passa de 1s com folga. O teste reprovava dizendo "cadastro travou no
      // e-mail" quando o e-mail não tinha nada a ver — a pior espécie de falha,
      // a que mente sobre a causa. Nunca meça tempo de parede sobre bcrypt.
      const result = await service.register({
        email: 'fulano@empresa.com',
        password: 'senha-secreta',
        name: 'Fulano',
        uf: 'SC',
        aceiteTermos: true,
      });

      expect(result).toHaveProperty('accessToken');
      expect(users.create).toHaveBeenCalledTimes(1);
    });

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
      // Cadastro local sempre define senha (só o Google nasce sem — T-126).
      await expect(
        bcrypt.compare('senha-secreta', created.passwordHash as string),
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

    // T-126: conta criada pelo Google não tem hash. Sem esta guarda, o
    // bcrypt.compare receberia null e estouraria 500 em vez de 401.
    it('rejeita login por senha em conta sem senha (só Google)', async () => {
      users.findByEmail.mockResolvedValue(buildUser({ passwordHash: null }));

      await expect(
        service.login({ email: 'fulano@empresa.com', password: 'qualquer' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('loginGoogle (T-126)', () => {
    const identity = {
      sub: 'google-sub-1',
      email: 'fulano@empresa.com',
      name: 'Fulano',
    };

    it('loga quem já tem o google_sub vinculado, sem tocar em e-mail', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(
        buildUser({ googleSub: identity.sub }),
      );

      const result = await service.loginGoogle({ idToken: 'tok' });

      expect(result.accessToken).toBeDefined();
      // O `sub` é o id estável: nem consulta por e-mail, nem cria conta.
      expect(users.findByEmail).not.toHaveBeenCalled();
      expect(users.create).not.toHaveBeenCalled();
    });

    // Decisão do dono: mesma pessoa, o Google atesta o e-mail → vincula.
    // A conta local aqui JÁ verificou o e-mail, ou seja, quem a criou provou ser
    // o dono do endereço — é a mesma pessoa pelos dois caminhos, e só neste caso
    // a senha sobrevive ao vínculo (ver o teste de pre-hijacking abaixo).
    it('vincula o Google a uma conta local VERIFICADA e preserva a senha', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(null);
      const local = buildUser({
        passwordHash: 'hash-local',
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      });
      users.findByEmail.mockResolvedValue(local);
      users.linkGoogleSub.mockResolvedValue(
        buildUser({
          passwordHash: 'hash-local',
          emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
          googleSub: identity.sub,
        }),
      );

      const result = await service.loginGoogle({ idToken: 'tok' });

      expect(users.linkGoogleSub).toHaveBeenCalledWith(local.id, identity.sub);
      expect(users.create).not.toHaveBeenCalled();
      // Senha e sessões intactas: não há o que revogar de quem já provou posse.
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
      expect(refreshTokens.delete).not.toHaveBeenCalled();
      expect(result.user.temSenha).toBe(true);
      expect(result.user.googleVinculado).toBe(true);
    });

    // REGRESSÃO — account pre-hijacking (VULN-002).
    //
    // O cadastro por e-mail é auto-login: a conta existe com senha e o e-mail
    // fica NÃO verificado, sem ninguém precisar abrir a caixa de entrada. Então
    // um atacante cadastra `vitima@empresa.com` com a senha dele e espera. A
    // vítima entra pelo Google, cai NESTA conta e a povoa (CNPJ, certidões,
    // propostas) — e o atacante volta com a senha, que antes continuava valendo.
    //
    // Quem prova posse do e-mail aqui é o Google, para a vítima. A senha nunca
    // foi provada: tem de morrer, junto das sessões que o atacante deixou abertas.
    it('revoga senha e sessões ao vincular conta com e-mail NÃO verificado', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(null);
      const doAtacante = buildUser({
        passwordHash: 'hash-do-atacante',
        emailVerifiedAt: null,
      });
      users.findByEmail.mockResolvedValue(doAtacante);
      users.linkGoogleSub.mockResolvedValue(
        buildUser({
          passwordHash: null,
          emailVerifiedAt: new Date(),
          googleSub: identity.sub,
        }),
      );

      const result = await service.loginGoogle({ idToken: 'tok' });

      expect(users.updatePasswordHash).toHaveBeenCalledWith(
        doAtacante.id,
        null,
      );
      expect(refreshTokens.delete).toHaveBeenCalledWith({
        userId: doAtacante.id,
      });
      expect(users.linkGoogleSub).toHaveBeenCalledWith(
        doAtacante.id,
        identity.sub,
      );
      // A vítima entra, e a conta não tem mais senha para o atacante usar.
      expect(result.user.temSenha).toBe(false);
    });

    // O id_token só passa pelo verifier com `email_verified` — o vínculo é a
    // prova que faltava. Sem marcar, a conta ficaria pedindo verificação para
    // sempre a quem o Google já atestou.
    it('marca o e-mail como verificado ao vincular', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(null);
      const local = buildUser({ passwordHash: null, emailVerifiedAt: null });
      users.findByEmail.mockResolvedValue(local);
      users.linkGoogleSub.mockResolvedValue(
        buildUser({ googleSub: identity.sub, emailVerifiedAt: new Date() }),
      );

      await service.loginGoogle({ idToken: 'tok' });

      expect(users.markEmailVerified).toHaveBeenCalledWith(local.id);
    });

    it('cadastra conta nova sem senha, já verificada e sem UF', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: CreateUserInput) =>
        Promise.resolve(buildUser(input as Partial<User>)),
      );

      const result = await service.loginGoogle({
        idToken: 'tok',
        aceiteTermos: true,
      });

      const created = users.create.mock.calls[0][0];
      expect(created.passwordHash).toBeNull();
      expect(created.provider).toBe(AuthProvider.GOOGLE);
      expect(created.googleSub).toBe(identity.sub);
      // O Google atesta o e-mail → nasce verificada (fecha a T-132).
      expect(created.emailVerifiedAt).toBeInstanceOf(Date);
      expect(created.termsAcceptedAt).toBeInstanceOf(Date);
      // Sem UF: o onboarding (T-108) precisa coletá-la, senão a captação (T-18)
      // nunca roda para este usuário.
      expect(created.uf).toBeNull();
      expect(result.accessToken).toBeDefined();
    });

    // Conta Google nasce verificada e nunca passa pelo verifyEmail — que é de
    // onde sai o boas-vindas do cadastro por e-mail. Sem o disparo aqui, quem
    // entra pelo Google não recebe e-mail NENHUM, nunca.
    it('manda o boas-vindas ao cadastrar conta nova pelo Google', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: CreateUserInput) =>
        Promise.resolve(buildUser(input as Partial<User>)),
      );

      await service.loginGoogle({ idToken: 'tok', aceiteTermos: true });

      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      const enviado = mail.sendMail.mock.calls[0][0] as {
        to: string;
        html: string;
      };
      expect(enviado.to).toBe(identity.email);
      // Sem UF (o onboarding ainda não rodou) → texto genérico, não um estado.
      expect(enviado.html).toContain('sua região');
    });

    it('quem só está logando pelo Google não recebe boas-vindas de novo', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(
        buildUser({ googleSub: identity.sub }),
      );

      await service.loginGoogle({ idToken: 'tok' });

      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    // Best-effort: SMTP fora do ar não pode impedir a pessoa de entrar.
    it('falha no envio do boas-vindas não derruba o cadastro', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: CreateUserInput) =>
        Promise.resolve(buildUser(input as Partial<User>)),
      );
      mail.sendMail.mockRejectedValue(new Error('smtp fora'));

      await expect(
        service.loginGoogle({ idToken: 'tok', aceiteTermos: true }),
      ).resolves.toBeDefined();
    });

    // O aceite LGPD (T-102) é exigido no cadastro, não em cada login.
    it('recusa cadastro novo sem aceite dos termos', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.loginGoogle({ idToken: 'tok' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(users.create).not.toHaveBeenCalled();
    });

    it('não exige aceite de quem já tem conta (está apenas logando)', async () => {
      google.verificar.mockResolvedValue(identity);
      users.findByGoogleSub.mockResolvedValue(
        buildUser({ googleSub: identity.sub }),
      );

      await expect(
        service.loginGoogle({ idToken: 'tok' }),
      ).resolves.toBeDefined();
    });

    it('propaga a rejeição do id_token inválido, sem criar nada', async () => {
      google.verificar.mockRejectedValue(
        new UnauthorizedException('Login com Google inválido'),
      );

      await expect(
        service.loginGoogle({ idToken: 'forjado', aceiteTermos: true }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.create).not.toHaveBeenCalled();
      expect(users.linkGoogleSub).not.toHaveBeenCalled();
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
      // `null` ali só vale para a REVOGAÇÃO do vínculo do Google; trocar a senha
      // sempre grava um hash de verdade.
      expect(typeof novoHash).toBe('string');
      await expect(
        bcrypt.compare('nova-senha-123', novoHash as string),
      ).resolves.toBe(true);
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

    // T-126: conta só-Google nunca teve senha. "Redefinir" ali seria CRIAR uma
    // senha por e-mail. Silêncio — e a resposta 204 segue idêntica (anti-enumeração).
    it('conta sem senha (só Google): não gera token nem envia', async () => {
      users.findByEmail.mockResolvedValue(buildUser({ passwordHash: null }));
      await service.forgotPassword('fulano@empresa.com');
      expect(passwordResets.save).not.toHaveBeenCalled();
      expect(mail.sendMail).not.toHaveBeenCalled();
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

  // T-127: o trial de 7 dias nasce no NOSSO banco, nos dois caminhos de cadastro.
  // O caminho de entrada não pode mudar o que a pessoa ganha.
  describe('trial no cadastro (T-127)', () => {
    it('cadastro por e-mail inicia o trial', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: CreateUserInput) =>
        Promise.resolve(buildUser(input)),
      );

      const r = await service.register({
        email: 'fulano@empresa.com',
        password: 'senha-secreta',
        name: 'Fulano',
        uf: 'SC',
        aceiteTermos: true,
      });

      expect(assinaturas.iniciarTrial).toHaveBeenCalledWith(r.user.id);
    });

    it('cadastro pelo Google inicia o trial', async () => {
      google.verificar.mockResolvedValue({
        sub: 'google-sub-1',
        email: 'fulano@empresa.com',
        name: 'Fulano',
      });
      users.findByGoogleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: CreateUserInput) =>
        Promise.resolve(buildUser(input as Partial<User>)),
      );

      const r = await service.loginGoogle({
        idToken: 'tok',
        aceiteTermos: true,
      });

      expect(assinaturas.iniciarTrial).toHaveBeenCalledWith(r.user.id);
    });

    // Quem só LOGA não ganha trial novo (senão o teste seria infinito).
    it('login pelo Google de quem já tem conta NÃO inicia trial', async () => {
      google.verificar.mockResolvedValue({
        sub: 'google-sub-1',
        email: 'fulano@empresa.com',
        name: 'Fulano',
      });
      users.findByGoogleSub.mockResolvedValue(
        buildUser({ googleSub: 'google-sub-1' }),
      );

      await service.loginGoogle({ idToken: 'tok' });

      expect(assinaturas.iniciarTrial).not.toHaveBeenCalled();
    });
  });
});
