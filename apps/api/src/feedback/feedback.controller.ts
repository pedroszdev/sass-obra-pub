import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { THROTTLE } from '../common/throttling/throttle.config';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackService } from './feedback.service';

// Reporte de problema in-app (T-202). Qualquer usuário AUTENTICADO pode reportar
// — SEM SubscriptionGuard de propósito: um usuário bloqueado pelo paywall
// precisa poder dizer "não consigo usar". Throttle moderado contra flood.
@UseGuards(JwtAuthGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Throttle(THROTTLE.FEEDBACK)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  reportar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFeedbackDto,
  ): Promise<void> {
    return this.feedback.criar({
      userId: user.id,
      mensagem: dto.mensagem,
      rota: dto.rota,
      versao: dto.versao,
    });
  }
}
