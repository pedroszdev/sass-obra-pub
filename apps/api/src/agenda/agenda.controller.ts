import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../assinaturas/subscription.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AgendaService } from './agenda.service';
import { AgendaEvento } from './agenda.types';

// Agenda de prazos do usuário logado (T-91).
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  listar(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: AgendaEvento[] }> {
    return this.agenda.listar(user.id);
  }
}
