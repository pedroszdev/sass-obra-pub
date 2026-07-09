import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE } from '../common/throttling/throttle.config';
import { NotificacoesService } from './notificacoes.service';

// Disparo manual do envio de notificações (T-103). Como o @Cron do Render free
// hiberna, um cron externo bate aqui. Protegido pelo mesmo token da captação.
@Controller('notificacoes')
export class NotificacoesController {
  constructor(
    private readonly notificacoes: NotificacoesService,
    private readonly config: ConfigService,
  ) {}

  @Throttle(THROTTLE.CAPTACAO)
  @HttpCode(HttpStatus.OK)
  @Post('run')
  async run(
    @Headers('x-captacao-token') token?: string,
  ): Promise<{ alertas: number; obrasDoDia: number }> {
    const expected = this.config.get<string>('CAPTACAO_TRIGGER_TOKEN');
    if (!expected) {
      throw new ServiceUnavailableException(
        'Gancho desabilitado: defina CAPTACAO_TRIGGER_TOKEN.',
      );
    }
    if (!token || token !== expected) {
      throw new UnauthorizedException('Token inválido.');
    }
    const alertas = await this.notificacoes.enviarPendentes();
    const obrasDoDia = await this.notificacoes.enviarObraDoDia();
    return { alertas, obrasDoDia };
  }
}
