import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
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
    const user = await this.users.findById(current.id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return toUserResponse(user);
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
    return toUserResponse(user);
  }
}
