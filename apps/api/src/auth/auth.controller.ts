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
import { GoogleVerifierService } from './google/google-verifier.service';
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

// O que precisamos do request numa navegação: o host, para montar o
// `redirect_uri` que mandamos ao Google. Ele PRECISA bater exatamente com o que
// está cadastrado no Google Cloud Console (§8) — por isso sai do host real do
// pedido, e não de mais uma env var que poderia divergir do que está no ar.
export interface NavRequest extends CookieRequest {
  headers: {
    cookie?: string;
    host?: string;
    'x-forwarded-proto'?: string;
  };
}

// O token assinado que o Google devolve no POST do callback. O nome do campo
// depende do fluxo: `id_token` no OpenID Connect (o nosso), `credential` no SDK
// (o antigo). Aceitamos os dois — o corpo é de terceiro e não o controlamos.
const TAMANHO_MAX_TOKEN = 4096;

export function tokenDoCallback(body: Record<string, unknown>): string {
  const token = body.id_token ?? body.credential;
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > TAMANHO_MAX_TOKEN
  ) {
    throw new UnauthorizedException('Login com Google inválido');
  }
  return token;
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
    private readonly googleAuth: GoogleVerifierService,
  ) {}

  // Para onde o callback do Google devolve o navegador. Mesmo valor do CORS
  // (main.ts): o front em produção, o Vite em dev.
  private get webOrigin(): string {
    return (
      this.config.get<string>('WEB_ORIGIN')?.trim().replace(/\/$/, '') ||
      'http://localhost:5173'
    );
  }

  // Origem desta API, como o navegador a enxerga. No Render o TLS termina no
  // proxy, então o protocolo real vem no `x-forwarded-proto` (o app fala http).
  private apiOrigin(req: NavRequest): string {
    const proto = req.headers['x-forwarded-proto'] ?? 'http';
    return `${proto}://${req.headers.host ?? 'localhost:3000'}`;
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

  // Abre o fluxo por REDIRECT (T-126b): o navegador chega AQUI (navegação de
  // topo, vinda do botão do front), a API sorteia o nonce, grava o cookie e
  // manda o usuário à tela de consentimento do Google.
  //
  // POR QUE UMA NAVEGAÇÃO, E NÃO UM FETCH DO FRONT: o cookie precisa existir no
  // navegador quando o Google fizer o POST no callback. Gravado a partir de um
  // fetch do front (outro site), ele é um cookie DE TERCEIRO — Safari e Firefox
  // o descartam, e o Chrome também, se o usuário bloqueou terceiros. Foi o que
  // derrubou a primeira versão em produção ("Login com Google expirou"). Numa
  // navegação de topo, quem está no topo é a API: cookie primário, ninguém
  // bloqueia.
  @Throttle(THROTTLE.AUTH)
  @Get('google/start')
  googleStart(@Req() req: NavRequest, @Res() res: RedirectResponse): void {
    try {
      const nonce = criarNonce();
      const url = this.googleAuth.urlDeConsentimento(
        nonce,
        `${this.apiOrigin(req)}/auth/google/callback`,
      );
      setGoogleNonceCookie(res, nonce);
      res.redirect(url);
    } catch (error) {
      this.logger.warn(
        `Início do login com Google recusado: ${this.msg(error)}`,
      );
      res.redirect(`${this.webOrigin}/login?erro=google`);
    }
  }

  // Retorno do Google no fluxo por REDIRECT (T-126b). NÃO é chamado pelo nosso
  // front: quem faz este POST é o navegador do usuário, navegando a partir do
  // Google (`application/x-www-form-urlencoded`). Por isso a resposta é um 302,
  // e não JSON — o access token nasce depois, quando o front trocar o cookie de
  // refresh em /auth/refresh (rota /entrando).
  //
  // O corpo vem como `Record` cru, de propósito: é um formulário de TERCEIRO, do
  // qual só nos interessa o token. Um DTO aqui passaria pelo ValidationPipe
  // global (`forbidNonWhitelisted`) e qualquer campo novo do Google viraria um
  // 400 na cara do usuário — foi o que já aconteceu uma vez.
  @Throttle(THROTTLE.AUTH)
  @Post('google/callback')
  async googleCallback(
    @Body() body: Record<string, unknown>,
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
      const result = await this.auth.loginGoogleRedirect(
        tokenDoCallback(body),
        nonce,
      );
      setRefreshCookie(res, result.refreshToken);
      res.redirect(`${this.webOrigin}/entrando`);
    } catch (error) {
      // Falha aqui vira tela de login com aviso — não dá para devolver JSON a
      // uma navegação de página. O motivo fica no log, não na URL.
      this.logger.warn(`Callback do Google recusado: ${this.msg(error)}`);
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
