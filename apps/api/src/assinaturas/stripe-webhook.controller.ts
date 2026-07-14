import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { StripeWebhookService } from './stripe-webhook.service';

// Forma mínima do request que precisamos: o corpo CRU. Tipado à mão (mesmo
// padrão do refresh-cookie/multer) — o Nest injeta o objeto real do Express.
export interface RawBodyRequest {
  rawBody?: Buffer;
}

// Webhook da Stripe (BACKLOG T-129). Rota PÚBLICA de propósito: quem faz este
// POST é a Stripe, não o nosso front — ela não tem (nem teria) um JWT nosso. O
// que autentica aqui é a ASSINATURA CRIPTOGRÁFICA do corpo.
//
// Sem `@UseGuards(JwtAuthGuard)` e sem DTO: o corpo é de TERCEIRO e precisa
// chegar CRU (o ValidationPipe global e o body parser destruiriam os bytes de que
// a verificação depende). Ver `rawBody: true` no main.ts.
//
// `@SkipThrottle`: a Stripe pode entregar uma rajada (reentregas acumuladas após
// uma indisponibilidade nossa). Tomar 429 dela seria perder eventos de pagamento.
@SkipThrottle()
@Controller('assinaturas')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly webhook: StripeWebhookService) {}

  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async receber(
    @Req() req: RawBodyRequest,
    @Headers('stripe-signature') assinatura?: string,
  ): Promise<{ recebido: boolean }> {
    // Sem o corpo cru não há verificação possível — falhar alto é melhor do que
    // aceitar um evento não verificado.
    if (!req.rawBody) {
      this.logger.error(
        'rawBody ausente — confira `rawBody: true` no main.ts.',
      );
      throw new Error('Corpo cru indisponível');
    }
    const evento = this.webhook.verificar(req.rawBody, assinatura);
    const r = await this.webhook.processar(evento);
    this.logger.log(
      `Webhook ${evento.type} (${evento.id}): ${r.aplicado ? 'aplicado' : (r.motivo ?? 'ignorado')}.`,
    );
    // 200 = "recebi". Se lançarmos, a Stripe REENTREGA — é o que queremos quando
    // o processamento falha de verdade (ver o catch do service).
    return { recebido: true };
  }
}
