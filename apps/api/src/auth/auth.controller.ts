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
import { UserResponse } from '../users/user-response';
import { AuthResult, AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
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
  // devolve o access token.
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AuthBody> {
    return this.entregarSessao(await this.auth.register(dto), res);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AuthBody> {
    return this.entregarSessao(await this.auth.login(dto), res);
  }

  // Renova a sessão a partir do cookie httpOnly (não do corpo). Rotaciona o
  // refresh (novo cookie) e devolve um access token novo.
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

  // Troca de senha do usuário logado (T-89). Exige a senha atual.
  @UseGuards(JwtAuthGuard)
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
