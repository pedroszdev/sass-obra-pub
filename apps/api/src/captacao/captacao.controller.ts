import {
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaptacaoJobService } from './captacao-job.service';

// Gatilho manual da captação (ops). O @Cron diário não é confiável no plano free
// do Render (o serviço hiberna), então expomos um endpoint para disparar um ciclo
// sob demanda — ou para um cron externo chamar (ver BACKLOG T-18).
//
// Protegido por um token compartilhado (`CAPTACAO_TRIGGER_TOKEN`) em vez de JWT:
// é um gancho de operação, não uma ação de usuário. Sem o token configurado, o
// endpoint fica desabilitado.
@Controller('captacao')
export class CaptacaoController {
  private readonly logger = new Logger(CaptacaoController.name);
  private running = false;

  constructor(
    private readonly job: CaptacaoJobService,
    private readonly config: ConfigService,
  ) {}

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  run(@Headers('x-captacao-token') token?: string): { status: string } {
    const expected = this.config.get<string>('CAPTACAO_TRIGGER_TOKEN');
    if (!expected) {
      throw new ServiceUnavailableException(
        'Gatilho de captação desabilitado: defina CAPTACAO_TRIGGER_TOKEN.',
      );
    }
    if (!token || token !== expected) {
      throw new UnauthorizedException('Token de captação inválido.');
    }
    if (this.running) {
      throw new ConflictException('Captação já está em execução.');
    }

    this.running = true;
    this.logger.log('Captação disparada manualmente via POST /captacao/run.');
    // Fire-and-forget: a captação pode levar minutos (backfill paginando o PNCP),
    // então respondemos 202 na hora e rodamos em segundo plano. O resultado fica
    // nos logs e na tabela sync_runs (T-19).
    void this.job
      .runOnce()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Captação manual falhou: ${message}`);
      })
      .finally(() => {
        this.running = false;
      });

    return { status: 'accepted' };
  }
}
