import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import {
  emailBoasVindas,
  emailRedefinicaoSenha,
  emailVerificacao,
} from '../mail/mail.templates';
import { isUf, UF_NOMES } from '../common/uf';
import { AuthProvider } from '../users/auth-provider.enum';
import { toUserResponse, UserResponse } from '../users/user-response';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailVerification } from './email-verification.entity';
import {
  GoogleIdentity,
  GoogleVerifierService,
} from './google/google-verifier.service';
import { PasswordReset } from './password-reset.entity';
import { RefreshToken } from './refresh-token.entity';
import { JwtPayload } from './types/jwt-payload';

const BCRYPT_ROUNDS = 12;
// Validade do link de redefinição de senha (T-101).
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora
// Validade do link de verificação de e-mail (T-132).
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: UserResponse;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(PasswordReset)
    private readonly passwordResets: Repository<PasswordReset>,
    @InjectRepository(EmailVerification)
    private readonly emailVerifications: Repository<EmailVerification>,
    private readonly mail: MailService,
    private readonly google: GoogleVerifierService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      cnpj: dto.cnpj ?? null,
      porte: dto.porte ?? null,
      uf: dto.uf,
      // Registra o aceite LGPD (T-102) no momento do cadastro.
      termsAcceptedAt: new Date(),
    });
    // Dispara a verificação de e-mail (T-132) — best-effort, não trava o cadastro.
    await this.enviarVerificacao(user).catch((e) =>
      this.logger.warn(`Falha ao enviar verificação: ${this.msg(e)}`),
    );
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: toUserResponse(user) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    // Mesmo erro para usuário inexistente, conta sem senha (só Google, T-126) ou
    // senha errada — não vaza quem existe nem por qual caminho a conta entra.
    if (
      !user ||
      !user.passwordHash ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const tokens = await this.issueTokens(user);
    // Inclui os municípios preferidos (T-94) já no login — o front usa direto,
    // sem esperar um /users/me.
    const municipios = await this.users.getMunicipiosPreferidos(user.id);
    return { ...tokens, user: toUserResponse(user, municipios) };
  }

  // Entrar/cadastrar com Google (T-126). O id_token já vem verificado (assinatura,
  // audiência, expiração e e-mail confirmado) — ver GoogleVerifierService.
  //
  // Três caminhos, nesta ordem:
  //   1. `google_sub` conhecido  → é a mesma pessoa, loga. (Vale mesmo se ela
  //      trocou o e-mail no Google: o `sub` é o id estável.)
  //   2. e-mail conhecido        → VINCULA ao usuário local (decisão do dono):
  //      é a mesma pessoa e o Google atesta o e-mail. A senha continua valendo.
  //   3. nada bate               → cadastra. Nasce sem senha, com e-mail já
  //      verificado (T-132) e SEM UF — o onboarding coleta a região, sem a qual
  //      a captação (T-18) não roda para este usuário.
  async loginGoogle(dto: GoogleLoginDto): Promise<AuthResult> {
    const identity = await this.google.verificar(dto.idToken);
    return this.entrarOuCadastrar(identity, dto.aceiteTermos === true);
  }

  // Mesma coisa, pelo fluxo de REDIRECT (T-126b): o id_token não volta pelo JS,
  // volta num POST do Google para o callback. Além da verificação de sempre,
  // exige o nonce que esta API sorteou (anti-CSRF — ver google-nonce-cookie.ts).
  //
  // O aceite dos termos é implícito (decisão do dono): o botão do Google vive só
  // nas telas de login/cadastro, ambas avisando que continuar com o Google aceita
  // os Termos e a Privacidade. O instante segue gravado em `terms_accepted_at`.
  async loginGoogleRedirect(
    credential: string,
    nonce: string,
  ): Promise<AuthResult> {
    const identity = await this.google.verificar(credential, nonce);
    return this.entrarOuCadastrar(identity, true);
  }

  private async entrarOuCadastrar(
    identity: GoogleIdentity,
    aceiteTermos: boolean,
  ): Promise<AuthResult> {
    const porSub = await this.users.findByGoogleSub(identity.sub);
    if (porSub) return this.sessaoDe(porSub);

    const porEmail = await this.users.findByEmail(identity.email);
    if (porEmail) {
      const vinculado = await this.users.linkGoogleSub(
        porEmail.id,
        identity.sub,
      );
      return this.sessaoDe(vinculado);
    }

    // Conta nova = cadastro: exige o mesmo aceite LGPD do /auth/register (T-102).
    if (!aceiteTermos) {
      throw new BadRequestException(
        'É preciso aceitar os Termos e a Política de Privacidade',
      );
    }
    const agora = new Date();
    const user = await this.users.create({
      email: identity.email,
      passwordHash: null,
      name: identity.name,
      cnpj: null,
      porte: null,
      uf: null,
      termsAcceptedAt: agora,
      provider: AuthProvider.GOOGLE,
      googleSub: identity.sub,
      emailVerifiedAt: agora,
    });
    return this.sessaoDe(user);
  }

  // Emite os tokens e monta a resposta com os municípios preferidos (T-94).
  private async sessaoDe(user: User): Promise<AuthResult> {
    const tokens = await this.issueTokens(user);
    const municipios = await this.users.getMunicipiosPreferidos(user.id);
    return { ...tokens, user: toUserResponse(user, municipios) };
  }

  // Troca de senha do usuário logado (T-89). Exige a senha atual; ao trocar,
  // revoga TODOS os refresh tokens (encerra as outras sessões) — o access token
  // atual segue válido até expirar. Mensagens não vazam qual passo falhou.
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.users.findById(userId);
    // Conta só-Google não tem senha atual para conferir (T-126) — recusa antes do
    // bcrypt.compare, que rejeitaria um hash null com TypeError.
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.users.updatePasswordHash(user.id, passwordHash);
    await this.refreshTokens.delete({ userId: user.id });
  }

  // "Esqueci a senha" (T-101). NÃO vaza se o e-mail existe — sempre resolve OK.
  // Gera um token de uso único (guarda só o hash) e manda o link por e-mail.
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return; // resposta idêntica pra e-mail inexistente (anti-enumeração)
    // Conta só-Google (T-126) nunca teve senha: mandar um link de "redefinição"
    // seria CRIAR senha por e-mail, não recuperar. Silêncio, mesma resposta 204.
    if (!user.passwordHash) return;

    const token = randomBytes(32).toString('hex');
    await this.passwordResets.save(
      this.passwordResets.create({
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
        usedAt: null,
      }),
    );

    const base = this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
    const link = `${base}/redefinir-senha?token=${token}`;
    await this.mail.sendMail({
      to: user.email,
      ...emailRedefinicaoSenha(user.name, link),
    });
  }

  // Redefine a senha a partir do token do e-mail (T-101). Token inválido/expirado/
  // já usado → 400. Ao trocar, revoga os refresh tokens (encerra outras sessões).
  async resetPassword(token: string, novaSenha: string): Promise<void> {
    const registro = await this.passwordResets.findOne({
      where: { tokenHash: this.hashToken(token) },
    });
    if (
      !registro ||
      registro.usedAt ||
      registro.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Link inválido ou expirado. Peça um novo.');
    }
    const passwordHash = await bcrypt.hash(novaSenha, BCRYPT_ROUNDS);
    await this.users.updatePasswordHash(registro.userId, passwordHash);
    registro.usedAt = new Date();
    await this.passwordResets.save(registro);
    await this.refreshTokens.delete({ userId: registro.userId });
  }

  // Gera um token de verificação (T-132) e manda o e-mail de confirmação.
  private async enviarVerificacao(user: User): Promise<void> {
    const token = randomBytes(32).toString('hex');
    await this.emailVerifications.save(
      this.emailVerifications.create({
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        usedAt: null,
      }),
    );
    const base = this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
    const link = `${base}/verificar-email?token=${token}`;
    await this.mail.sendMail({
      to: user.email,
      ...emailVerificacao(user.name, link),
    });
  }

  // Verifica o e-mail a partir do token (T-132). Token inválido/expirado/usado
  // → 400. Marca o usuário como verificado (idempotente) e o token como usado.
  async verifyEmail(token: string): Promise<void> {
    const registro = await this.emailVerifications.findOne({
      where: { tokenHash: this.hashToken(token) },
    });
    if (
      !registro ||
      registro.usedAt ||
      registro.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Link inválido ou expirado. Peça um novo.');
    }
    const user = await this.users.findById(registro.userId);
    // Só a 1ª verificação dispara o boas-vindas (evita reenvio se o token for
    // reusado num fluxo idempotente). Falha de e-mail nunca derruba a confirmação.
    const jaVerificado = Boolean(user?.emailVerifiedAt);
    await this.users.markEmailVerified(registro.userId);
    registro.usedAt = new Date();
    await this.emailVerifications.save(registro);

    if (user && !jaVerificado) {
      const base = this.config.get<string>(
        'WEB_ORIGIN',
        'http://localhost:5173',
      );
      const ufNome = isUf(user.uf) ? UF_NOMES[user.uf] : 'sua região';
      await this.mail.sendMail({
        to: user.email,
        ...emailBoasVindas(user.name, ufNome, base),
      });
    }
  }

  // Reenvia a verificação para o usuário logado (T-132). No-op se já verificado.
  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.emailVerifiedAt) return;
    await this.enviarVerificacao(user);
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = this.verifyRefreshToken(refreshToken);
    const stored = await this.refreshTokens.findOne({
      where: { tokenHash: this.hashToken(refreshToken) },
    });
    if (!stored || stored.revoked || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    // Rotação: revoga o token usado antes de emitir um novo par.
    stored.revoked = true;
    await this.refreshTokens.save(stored);
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: this.hashToken(refreshToken) },
      { revoked: true },
    );
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_EXPIRES',
        '15m',
      ) as JwtSignOptions['expiresIn'],
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>(
          'JWT_REFRESH_EXPIRES',
          '7d',
        ) as JwtSignOptions['expiresIn'],
      },
    );
    await this.persistRefreshToken(user.id, refreshToken);
    return { accessToken, refreshToken };
  }

  private async persistRefreshToken(
    userId: string,
    token: string,
  ): Promise<void> {
    const decoded = this.jwt.decode(token) as { exp: number };
    const entity = this.refreshTokens.create({
      userId,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(decoded.exp * 1000),
      revoked: false,
    });
    await this.refreshTokens.save(entity);
  }

  private verifyRefreshToken(token: string): JwtPayload {
    try {
      return this.jwt.verify<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
