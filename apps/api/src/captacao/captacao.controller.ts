import {
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertOpsToken } from '../common/ops-token';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE } from '../common/throttling/throttle.config';
import { IaCustoResumo, IaCustoService } from '../editais/ia-custo.service';
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
    private readonly iaCusto: IaCustoService,
  ) {}

  // Leitura do gasto de IA acumulado (T-133). Ops/admin — mesmo token do disparo
  // de captação. Sem gráfico: JSON com hoje/mês/total por tipo.
  @Throttle(THROTTLE.CAPTACAO)
  @Get('ia-custo')
  iaCusto_(
    @Headers('x-captacao-token') token?: string,
  ): Promise<IaCustoResumo> {
    this.assertToken(token);
    return this.iaCusto.resumo();
  }

  // Throttle por IP (T-104): dispara captação + pré-computação de IA (pesado).
  // O token compartilhado já protege, mas o rate limit limita replay/abuso.
  @Throttle(THROTTLE.CAPTACAO)
  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  run(@Headers('x-captacao-token') token?: string): { status: string } {
    this.assertToken(token);
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

  // Valida o token compartilhado de ops (comparação em tempo constante — T-153).
  private assertToken(token?: string): void {
    assertOpsToken(
      token,
      this.config.get<string>('CAPTACAO_TRIGGER_TOKEN'),
      'Gancho de captação',
    );
  }
}
