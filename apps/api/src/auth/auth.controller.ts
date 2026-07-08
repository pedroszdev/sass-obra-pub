import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EmailThrottlerGuard } from '../common/throttling/email-throttler.guard';
import { THROTTLE } from '../common/throttling/throttle.config';
import { UserThrottlerGuard } from '../common/throttling/user-throttler.guard';
import { UserResponse } from '../users/user-response';
import { AuthResult, AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  clearRefreshCookie,
  CookieRequest,
  CookieResponse,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';
import { AuthenticatedUser } from './types/jwt-payload';

// Corpo devolvido no login/register: o access token + o usuário. O refresh token
// NÃO vai no corpo (T-119a) — vai num cookie httpOnly que o JS não lê.
export interface AuthBody {
  accessToken: string;
  user: UserResponse;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Cadastro público (role sempre USER). Auto-login: seta o cookie do refresh e
  // devolve o access token. Throttle por IP (T-104): o email é escolhido pelo
  // atacante e muda a cada tentativa, então só o IP protege aqui.
  @Throttle(THROTTLE.AUTH)
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AuthBody> {
    return this.entregarSessao(await this.auth.register(dto), res);
  }

  // Throttle duplo (T-104): por IP (ThrottlerGuard global) contra spraying/CPU do
  // bcrypt, e por EMAIL (EmailThrottlerGuard) contra brute-force de uma conta via
  // IPs rotativos. Ambos leem o @Throttle abaixo; o que estourar primeiro barra.
  @Throttle(THROTTLE.AUTH)
  @UseGuards(EmailThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AuthBody> {
    return this.entregarSessao(await this.auth.login(dto), res);
  }

  // Renova a sessão a partir do cookie httpOnly (não do corpo). Rotaciona o
  // refresh (novo cookie) e devolve um access token novo. Throttle por IP com
  // folga (T-104): o cold start do Render pode disparar alguns em sequência.
  @Throttle(THROTTLE.REFRESH)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ accessToken: string }> {
    const token = readRefreshCookie(req);
    if (!token) {
      throw new UnauthorizedException('Refresh token ausente');
    }
    const tokens = await this.auth.refresh(token);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  // Revoga o refresh (do cookie) e limpa o cookie. Idempotente: sem cookie, só
  // garante que ele saia.
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<void> {
    const token = readRefreshCookie(req);
    if (token) {
      await this.auth.logout(token);
    }
    clearRefreshCookie(res);
  }

  // "Esqueci a senha" (T-101). Sempre 204 (não vaza se o e-mail existe). Throttle
  // por IP contra spam de envio.
  @Throttle(THROTTLE.AUTH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.auth.forgotPassword(dto.email);
  }

  // Redefine a senha a partir do token do e-mail (T-101). Throttle por IP contra
  // brute-force do token.
  @Throttle(THROTTLE.AUTH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto.token, dto.novaSenha);
  }

  // Troca de senha do usuário logado (T-89). Exige a senha atual. Throttle por
  // USUÁRIO (T-104): faz bcrypt.compare da senha atual — brute-force + CPU. O
  // JwtAuthGuard roda antes e popula req.user para o UserThrottlerGuard.
  @Throttle(THROTTLE.AUTH)
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.auth.changePassword(user.id, dto);
  }

  // Seta o cookie httpOnly do refresh e devolve só o access token + usuário.
  private entregarSessao(result: AuthResult, res: CookieResponse): AuthBody {
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }
}
