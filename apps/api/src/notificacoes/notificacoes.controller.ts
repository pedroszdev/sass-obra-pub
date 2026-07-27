import {
  Controller,
  Get,
  Headers,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertOpsToken } from '../common/ops-token';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
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
  async run(@Headers('x-captacao-token') token?: string): Promise<{
    alertas: number;
    obrasDoDia: number;
    renovacoes: number;
    trialAcabando: number;
    completePerfil: number;
    dunning: number;
  }> {
    assertOpsToken(
      token,
      this.config.get<string>('CAPTACAO_TRIGGER_TOKEN'),
      'Gancho de notificações',
    );
    const alertas = await this.notificacoes.enviarPendentes();
    const obrasDoDia = await this.notificacoes.enviarObraDoDia();
    // Cada etapa que depende de terceiro (Stripe) isola o erro — não desperdiça
    // o disparo inteiro se um cair.
    const renovacoes = await this.notificacoes
      .enviarAvisosRenovacaoAnual()
      .catch(() => 0);
    const trialAcabando = await this.notificacoes
      .enviarTrialAcabando()
      .catch(() => 0);
    const completePerfil = await this.notificacoes
      .enviarCompletePerfil()
      .catch(() => 0);
    const dunning = await this.notificacoes.enviarDunning().catch(() => 0);
    return {
      alertas,
      obrasDoDia,
      renovacoes,
      trialAcabando,
      completePerfil,
      dunning,
    };
  }

  // Descadastro em 1 clique do e-mail de obra do dia (T-135). PÚBLICO — o alvo é
  // o dono da caixa, não o nosso front (sem JWT); autentica pelo TOKEN assinado.
  //
  // POST: é o endpoint do cabeçalho List-Unsubscribe-Post (RFC 8058) — o
  // Gmail/Yahoo faz este POST quando o usuário clica em "Cancelar inscrição".
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('descadastrar')
  async descadastrarPost(
    @Query('token') token?: string,
  ): Promise<{ ok: boolean }> {
    return { ok: await this.notificacoes.descadastrarObraDoDia(token ?? '') };
  }

  // GET: o link visível no rodapé (clique humano). Descadastra e mostra uma
  // página simples de confirmação. HTML mínimo, sem depender do front.
  @SkipThrottle()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Get('descadastrar')
  async descadastrarGet(@Query('token') token?: string): Promise<string> {
    const ok = await this.notificacoes.descadastrarObraDoDia(token ?? '');
    const msg = ok
      ? 'Pronto! Você não vai mais receber o e-mail diário de obras da sua região. Os avisos de urgência (certidões e prazos) continuam. Para reativar, é só ligar nas preferências de notificação da sua conta.'
      : 'Não foi possível concluir o descadastro (link inválido ou expirado). Você pode gerenciar as notificações na sua conta.';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descadastro · PrumoLicita</title></head><body style="margin:0;background:#ECE7DF;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#24211D;"><div style="max-width:520px;margin:64px auto;padding:32px;background:#fff;border-radius:14px;border:1px solid #DED9D2;"><div style="font-weight:800;font-size:18px;letter-spacing:-0.02em;">Prumo<span style="color:#C25A26;">Licita</span></div><p style="font-size:15px;line-height:1.6;color:#4F4E4B;margin-top:18px;">${msg}</p></div></body></html>`;
  }
}
