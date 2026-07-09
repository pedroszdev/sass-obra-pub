import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { THROTTLE } from '../common/throttling/throttle.config';
import { UserThrottlerGuard } from '../common/throttling/user-throttler.guard';
import { ExcluirContaDto } from './dto/excluir-conta.dto';
import { MunicipiosPreferidosDto } from './dto/municipios-preferidos.dto';
import { NotificationPrefsDto } from './dto/notification-prefs.dto';
import { UfDto } from './dto/uf.dto';
import { toUserResponse, UserResponse } from './user-response';
import { CredencialExclusao, UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Dados do usuário logado. Rota protegida — prova o JwtAuthGuard.
  @Get('me')
  async me(@CurrentUser() current: AuthenticatedUser): Promise<UserResponse> {
    const [user, municipios] = await Promise.all([
      this.users.findById(current.id),
      this.users.getMunicipiosPreferidos(current.id),
    ]);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return toUserResponse(user, municipios);
  }

  // Substitui os municípios de atuação preferidos (T-94). Manda a lista completa.
  @Put('me/municipios')
  async updateMunicipios(
    @CurrentUser() current: AuthenticatedUser,
    @Body() dto: MunicipiosPreferidosDto,
  ): Promise<UserResponse> {
    const user = await this.users.findById(current.id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const municipios = await this.users.setMunicipiosPreferidos(
      current.id,
      dto.codigosIbge,
    );
    return toUserResponse(user, municipios);
  }

  // Define a UF de atuação (T-126). Usado pelo onboarding quando a conta nasceu
  // pelo Google (sem UF) — sem ela a captação (T-18) nunca roda para o usuário.
  @Put('me/uf')
  async updateUf(
    @CurrentUser() current: AuthenticatedUser,
    @Body() dto: UfDto,
  ): Promise<UserResponse> {
    const user = await this.users.setUf(current.id, dto.uf);
    const municipios = await this.users.getMunicipiosPreferidos(current.id);
    return toUserResponse(user, municipios);
  }

  // Atualiza as preferências de notificação do usuário logado (T-89).
  @Put('me/notifications')
  async updateNotifications(
    @CurrentUser() current: AuthenticatedUser,
    @Body() dto: NotificationPrefsDto,
  ): Promise<UserResponse> {
    const user = await this.users.updateNotificationPrefs(current.id, {
      whatsapp: dto.whatsapp,
      email: dto.email,
    });
    const municipios = await this.users.getMunicipiosPreferidos(current.id);
    return toUserResponse(user, municipios);
  }

  // Exporta todos os dados do titular (T-102/LGPD) num JSON — direito de acesso/
  // portabilidade. Sem os bytes dos PDFs (baixáveis no cofre) nem a senha.
  @Get('me/export')
  exportarDados(
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.users.exportarDados(current.id);
  }

  // Exclui a conta do titular (T-102/LGPD) — direito de exclusão. Exige prova de
  // posse atual: a senha, ou um id_token fresco do Google para conta sem senha
  // (T-126). Hard delete com cascade. Throttle por usuário (bcrypt/cripto).
  @Throttle(THROTTLE.AUTH)
  @UseGuards(UserThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  excluirConta(
    @CurrentUser() current: AuthenticatedUser,
    @Body() dto: ExcluirContaDto,
  ): Promise<void> {
    const credencial: CredencialExclusao = dto.senha
      ? { senha: dto.senha }
      : { idToken: dto.idToken as string };
    return this.users.excluirConta(current.id, credencial);
  }
}
