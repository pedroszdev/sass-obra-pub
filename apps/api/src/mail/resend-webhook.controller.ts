import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { capturarErro } from '../common/observabilidade';
import { ResendEvent, ResendWebhookService } from './resend-webhook.service';
import { verificarAssinaturaResend } from './resend-signature';

// Forma mínima do request: só o corpo CRU (mesmo padrão do webhook da Stripe).
interface RawBodyRequest {
  rawBody?: Buffer;
}

// Webhook de entrega/bounce do Resend (T-193). Rota PÚBLICA — quem faz o POST é o
// Resend, sem JWT nosso; o que autentica é a ASSINATURA (Svix) sobre o corpo CRU
// (ver `rawBody: true` no main.ts). Sem DTO e sem ValidationPipe: o corpo é de
// terceiro e a assinatura depende dos bytes originais.
//
// `@SkipThrottle`: o Resend pode entregar uma rajada (reentregas acumuladas); um
// 429 faria perder eventos de entrega.
@SkipThrottle()
@Controller('webhooks')
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name);

  constructor(
    private readonly webhook: ResendWebhookService,
    private readonly config: ConfigService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('resend')
  async receber(
    @Req() req: RawBodyRequest,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ): Promise<{ recebido: boolean }> {
    const segredo = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    // Sem segredo, o webhook está DESABILITADO: respondemos 200 e logamos (para o
    // Resend não reentregar eternamente), na mesma degradação dos outros provedores.
    if (!segredo?.trim()) {
      this.logger.warn(
        'Webhook do Resend recebido, mas RESEND_WEBHOOK_SECRET não está configurado — ignorado.',
      );
      return { recebido: true };
    }

    if (!req.rawBody) {
      this.logger.error(
        'rawBody ausente no webhook do Resend — confira `rawBody: true` no main.ts.',
      );
      return { recebido: true };
    }

    const valido = verificarAssinaturaResend(
      req.rawBody,
      { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      segredo,
    );
    if (!valido) {
      // Assinatura inválida: não processa. 200 mesmo assim — um 4xx só faria o
      // Resend reentregar um evento que continuaria inválido.
      this.logger.warn(
        'Webhook do Resend com assinatura inválida — descartado.',
      );
      return { recebido: true };
    }

    try {
      const evento = JSON.parse(req.rawBody.toString('utf8')) as ResendEvent;
      const r = await this.webhook.processar(evento);
      if (r.status !== 'aplicado') {
        this.logger.log(
          `Webhook do Resend ${evento.type ?? '?'}: ${r.status}${r.motivo ? ` (${r.motivo})` : ''}.`,
        );
      }
    } catch (e) {
      // Processar o evento nunca derruba a resposta (best-effort, como o log de
      // e-mail). Falha vai para o Sentry; o 200 evita reentrega de algo já perdido.
      capturarErro(e, 'resend-webhook.processar');
      this.logger.error(
        `Falha ao processar webhook do Resend: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return { recebido: true };
  }
}
