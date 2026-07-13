import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { EmailThrottlerGuard } from '../common/throttling/email-throttler.guard';
import { THROTTLE } from '../common/throttling/throttle.config';
import { UserThrottlerGuard } from '../common/throttling/user-throttler.guard';
import { UserResponse } from '../users/user-response';
import { AuthResult, AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleCallbackDto } from './dto/google-callback.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  clearGoogleNonceCookie,
  criarNonce,
  readGoogleNonceCookie,
  setGoogleNonceCookie,
} from './google/google-nonce-cookie';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  clearRefreshCookie,
  CookieRequest,
  CookieResponse,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';
import { AuthenticatedUser } from './types/jwt-payload';

// O callback do Google responde com 302 (é uma navegação do navegador, não um
// fetch do front) — o `redirect` do Express entra na forma mínima que tipamos.
export interface RedirectResponse extends CookieResponse {
  redirect(url: string): void;
}

// Corpo devolvido no login/register: o access token + o usuário. O refresh token
// NÃO vai no corpo (T-119a) — vai num cookie httpOnly que o JS não lê.
export interface AuthBody {
  accessToken: string;
  user: UserResponse;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Para onde o callback do Google devolve o navegador. Mesmo valor do CORS
  // (main.ts): o front em produção, o Vite em dev.
  private get webOrigin(): string {
    return (
      this.config.get<string>('WEB_ORIGIN')?.trim().replace(/\/$/, '') ||
      'http://localhost:5173'
    );
  }

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

  // Entrar/cadastrar com Google (T-126). Mesmo contrato de sessão do login: seta
  // o cookie httpOnly do refresh e devolve access token + usuário. Conta nova
  // nasce sem UF — o front a manda para o onboarding (T-108).
  //
  // Throttle por IP (AUTH): não há e-mail no corpo para a dimensão por conta, e
  // a verificação do id_token faz cripto (custo de CPU, como o bcrypt).
  @Throttle(THROTTLE.AUTH)
  @HttpCode(HttpStatus.OK)
  @Post('google')
  async google(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AuthBody> {
    return this.entregarSessao(await this.auth.loginGoogle(dto), res);
  }

  // Abre o fluxo por REDIRECT (T-126b): sorteia o nonce, guarda num cookie desta
  // API e devolve o valor para o front passar ao Google. É o par do callback
  // abaixo — sem esta chamada, o callback não tem com o que comparar e recusa.
  @Throttle(THROTTLE.AUTH)
  @Get('google/inicio')
  googleInicio(@Res({ passthrough: true }) res: CookieResponse): {
    nonce: string;
  } {
    const nonce = criarNonce();
    setGoogleNonceCookie(res, nonce);
    return { nonce };
  }

  // Retorno do Google no fluxo por REDIRECT (T-126b). NÃO é chamado pelo nosso
  // front: quem faz este POST é o navegador do usuário, navegando a partir do
  // Google (`application/x-www-form-urlencoded`). Por isso a resposta é um 302,
  // e não JSON — o access token nasce depois, quando o front trocar o cookie de
  // refresh em /auth/refresh (rota /entrando).
  //
  // O ValidationPipe local substitui o global: o Google manda campos nossos e
  // dele (`g_csrf_token`, `select_by`), e `forbidNonWhitelisted` recusaria o
  // pedido inteiro. Aqui o excedente é descartado (whitelist), não rejeitado.
  @Throttle(THROTTLE.AUTH)
  @Post('google/callback')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async googleCallback(
    @Body() dto: GoogleCallbackDto,
    @Req() req: CookieRequest,
    @Res() res: RedirectResponse,
  ): Promise<void> {
    const nonce = readGoogleNonceCookie(req);
    // O nonce é de uso único: sai do navegador aconteça o que acontecer.
    clearGoogleNonceCookie(res);
    try {
      if (!nonce) {
        throw new UnauthorizedException('Login com Google expirou');
      }
      const result = await this.auth.loginGoogleRedirect(dto.credential, nonce);
      setRefreshCookie(res, result.refreshToken);
      res.redirect(`${this.webOrigin}/entrando`);
    } catch (error) {
      // Falha aqui vira tela de login com aviso — não dá para devolver JSON a
      // uma navegação de página. O motivo fica no log, não na URL.
      this.logger.warn(
        `Callback do Google recusado: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      res.redirect(`${this.webOrigin}/login?erro=google`);
    }
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

  // Verifica o e-mail a partir do token do link (T-132). Público (o usuário pode
  // clicar deslogado). Throttle por IP contra brute-force do token.
  @Throttle(THROTTLE.AUTH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    return this.auth.verifyEmail(dto.token);
  }

  // Reenvia o e-mail de verificação para o usuário logado (T-132). Throttle por
  // usuário contra spam de reenvio.
  @Throttle(THROTTLE.AUTH)
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resend-verification')
  resendVerification(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.resendVerification(user.id);
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
