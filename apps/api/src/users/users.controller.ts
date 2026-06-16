import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { toUserResponse, UserResponse } from './user-response';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Dados do usuário logado. Rota protegida — prova o JwtAuthGuard.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() current: AuthenticatedUser): Promise<UserResponse> {
    const user = await this.users.findById(current.id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return toUserResponse(user);
  }
}
