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
import { toUserResponse, UserResponse } from './user-response';
import { UsersService } from './users.service';

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

  // Exclui a conta do titular (T-102/LGPD) — direito de exclusão. Exige a senha
  // atual; hard delete com cascade. Throttle por usuário (bcrypt.compare).
  @Throttle(THROTTLE.AUTH)
  @UseGuards(UserThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  excluirConta(
    @CurrentUser() current: AuthenticatedUser,
    @Body() dto: ExcluirContaDto,
  ): Promise<void> {
    return this.users.excluirConta(current.id, dto.senha);
  }
}
