import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { assertOpsToken } from '../common/ops-token';
import {
  ReconciliacaoService,
  ResultadoReconciliacao,
} from './reconciliacao.service';

// Gatilho manual da reconciliação (T-143). É OPS, não ação de usuário — protegido
// pelo mesmo token da captação (`CAPTACAO_TRIGGER_TOKEN`), sem JWT. O @Cron do
// service existe, mas hiberna no free tier; um cron externo bate aqui.
//
// Fora do paywall (obviamente) e sem JwtAuthGuard: quem chama é um cron, não um
// navegador logado.
@SkipThrottle()
@Controller('assinaturas')
export class ReconciliacaoController {
  constructor(
    private readonly reconciliacao: ReconciliacaoService,
    private readonly config: ConfigService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('reconciliar')
  run(
    @Headers('x-captacao-token') token?: string,
  ): Promise<ResultadoReconciliacao> {
    assertOpsToken(
      token,
      this.config.get<string>('CAPTACAO_TRIGGER_TOKEN'),
      'Reconciliação de assinaturas',
    );
    return this.reconciliacao.reconciliar();
  }
}
