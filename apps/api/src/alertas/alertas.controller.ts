import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../assinaturas/subscription.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AlertasService } from './alertas.service';
import { AlertaItem } from './alertas.types';

// Central de notificações do usuário logado (T-90).
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get()
  listar(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ itens: AlertaItem[]; naoLidos: number }> {
    return this.alertas.listar(user.id);
  }

  // Marca tudo como lido (zera o sino).
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('marcar-lido')
  marcarLido(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.alertas.marcarLido(user.id);
  }
}
