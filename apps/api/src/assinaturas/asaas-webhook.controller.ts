import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { AsaasWebhookService, EventoAsaas } from './asaas-webhook.service';

// Webhook do Asaas (T-214). Rota PÚBLICA, como a da Stripe e a do Resend: quem
// faz este POST é o provedor, que não tem (nem teria) um JWT nosso.
//
// 🔴 A DIFERENÇA QUE IMPORTA, e ela é uma REGRESSÃO em relação à Stripe: aqui
// não há assinatura criptográfica sobre o corpo. Medido na T-209 — o objeto
// webhook do Asaas não tem campo nenhum de HMAC, só um `authToken` ESTÁTICO que
// ele repete no header `asaas-access-token`. Consequências práticas:
//
//   1. **Não precisamos (nem podemos) do corpo cru.** O `rawBody: true` do
//      `main.ts` existe para a Stripe. Aqui o corpo pode ser parseado à vontade.
//   2. **O token é um segredo compartilhado, e vale como senha.** Um vazamento
//      permite forjar eventos de pagamento — e um evento forjado LIBERA ACESSO.
//      Comparação em tempo constante, nunca `===`.
//   3. **Quem tem a API key lê o token** (ele volta no GET /webhooks). Ou seja,
//      não há segregação real entre "quem integra" e "quem pode forjar".
//
// `@SkipThrottle`: o Asaas pode entregar uma rajada de reentregas acumuladas.
// Tomar 429 dele seria perder evento de pagamento.
@SkipThrottle()
@Controller('webhooks')
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(
    private readonly webhook: AsaasWebhookService,
    private readonly config: ConfigService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('asaas')
  async receber(
    @Body() corpo: EventoAsaas,
    @Headers('asaas-access-token') token?: string,
  ): Promise<{ recebido: boolean }> {
    const esperado = this.config.get<string>('ASAAS_WEBHOOK_TOKEN')?.trim();

    // Env ausente → webhook DESABILITADO, respondendo 200. Mesma degradação do
    // webhook do Resend (§8): 200 evita que o provedor reentregue para sempre e
    // acabe INTERROMPENDO a fila (o Asaas para depois de falhas seguidas — os
    // campos `interrupted`/`penalizedRequestsCount` existem para isso, T-209).
    if (!esperado) {
      this.logger.warn(
        'ASAAS_WEBHOOK_TOKEN ausente — webhook desabilitado, evento descartado.',
      );
      return { recebido: true };
    }

    if (!token || !this.tokenConfere(token, esperado)) {
      // 401 aqui é deliberado: token errado é tentativa de forjar pagamento, não
      // falha transitória. Não queremos que o Asaas reentregue isso.
      this.logger.error('Webhook do Asaas com token inválido — recusado.');
      throw new UnauthorizedException('Token inválido');
    }

    const r = await this.webhook.processar(corpo);
    this.logger.log(
      `Webhook ${corpo?.event ?? '?'} (${corpo?.id ?? '?'}): ${
        r.aplicado ? 'aplicado' : (r.motivo ?? 'ignorado')
      }.`,
    );
    return { recebido: true };
  }

  /**
   * Comparação em TEMPO CONSTANTE.
   *
   * ⚠️ `a === b` vaza o tamanho do prefixo correto pelo tempo de resposta, e com
   * o token sendo a ÚNICA barreira (não há assinatura de corpo aqui), esse
   * vazamento é o suficiente para valer o ataque. O `timingSafeEqual` exige
   * buffers do mesmo tamanho — daí a checagem de comprimento antes.
   */
  private tokenConfere(recebido: string, esperado: string): boolean {
    const a = Buffer.from(recebido);
    const b = Buffer.from(esperado);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
