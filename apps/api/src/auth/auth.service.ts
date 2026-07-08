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
import { toUserResponse, UserResponse } from '../users/user-response';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordReset } from './password-reset.entity';
import { RefreshToken } from './refresh-token.entity';
import { JwtPayload } from './types/jwt-payload';

const BCRYPT_ROUNDS = 12;
// Validade do link de redefinição de senha (T-101).
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

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
    private readonly mail: MailService,
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
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: toUserResponse(user) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    // Mesmo erro para usuário inexistente ou senha errada (não vaza quem existe).
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const tokens = await this.issueTokens(user);
    // Inclui os municípios preferidos (T-94) já no login — o front usa direto,
    // sem esperar um /users/me.
    const municipios = await this.users.getMunicipiosPreferidos(user.id);
    return { ...tokens, user: toUserResponse(user, municipios) };
  }

  // Troca de senha do usuário logado (T-89). Exige a senha atual; ao trocar,
  // revoga TODOS os refresh tokens (encerra as outras sessões) — o access token
  // atual segue válido até expirar. Mensagens não vazam qual passo falhou.
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.users.findById(userId);
    if (
      !user ||
      !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
    ) {
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
      subject: 'Redefinição de senha — PrumoLicita',
      html: `<p>Olá, ${user.name}.</p>
        <p>Recebemos um pedido para redefinir sua senha. O link vale 1 hora:</p>
        <p><a href="${link}">Redefinir minha senha</a></p>
        <p>Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>`,
      text: `Redefina sua senha (link válido por 1 hora): ${link}`,
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
