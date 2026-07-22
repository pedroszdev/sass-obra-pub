import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { capturarErro } from '../common/observabilidade';
import { MailLogService } from './mail-log.service';

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Timeouts do SMTP. Sem isto o nodemailer usa os defaults dele (minutos), e uma
// porta bloqueada segura a conexão por todo esse tempo — foi o que transformou
// uma falha de e-mail em tela travada no cadastro (o envio era aguardado).
const SMTP_TIMEOUT_MS = 10_000;
// O envio por HTTPS tem o mesmo teto: nada de e-mail pendura um pedido.
const HTTP_TIMEOUT_MS = 10_000;

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Envio de e-mail transacional (BACKLOG T-101). Três caminhos, nesta ordem:
//
//   1. RESEND_API_KEY → HTTPS (api.resend.com). É o caminho de PRODUÇÃO hoje.
//      O Render bloqueia a saída nas portas de SMTP (25/465/587) no plano free
//      desde set/2025 — por SMTP o e-mail simplesmente NÃO SAI de lá, dá
//      "Connection timeout" independentemente de host, porta ou credencial. A
//      443 não é bloqueada por ninguém.
//   2. SMTP_HOST → SMTP (nodemailer). Segue servindo quem estiver num plano
//      pago ou fora do Render; é também o caminho para um Mailtrap local.
//   3. nenhum dos dois → log-only (dev), como a IA degrada sem OPENAI_API_KEY.
//
// Erros NUNCA são propagados: o "esqueci a senha" não pode vazar sucesso/falha
// pelo comportamento, e provedor fora do ar não derruba cadastro/login.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private avisouLogOnly = false;

  // MailLogService é OPCIONAL (T-193): quando presente (via DI), registra cada
  // envio; ausente (ex.: testes que dão `new MailService(config)`), não faz nada.
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly mailLog?: MailLogService,
  ) {}

  private get from(): string {
    return this.config.get<string>(
      'MAIL_FROM',
      'PrumoLicita <nao-responda@prumolicita.com.br>',
    );
  }

  private get resendApiKey(): string | undefined {
    return this.config.get<string>('RESEND_API_KEY')?.trim() || undefined;
  }

  // Cria o transporte SMTP sob demanda; null quando não há SMTP_HOST.
  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) return null;
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get('SMTP_PORT', 587)),
      secure: this.config.get('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
    return this.transporter;
  }

  async sendMail(input: MailInput): Promise<void> {
    let provedor: 'resend' | 'smtp' | 'log' = 'log';
    let status: 'enviado' | 'falhou' | 'log' = 'log';
    let erroMsg: string | null = null;
    try {
      if (this.resendApiKey) {
        provedor = 'resend';
        await this.enviarPorHttp(input, this.resendApiKey);
        status = 'enviado';
        return;
      }
      const transporter = this.getTransporter();
      if (transporter) {
        provedor = 'smtp';
        await transporter.sendMail({
          from: this.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        status = 'enviado';
        return;
      }
      this.logOnly(input);
      status = 'log';
    } catch (erro) {
      // Não propaga (o cadastro não pode travar por e-mail), mas TAMBÉM não fica
      // só no log: foi assim que o SMTP bloqueado passou dias despercebido (T-106).
      status = 'falhou';
      erroMsg = this.msg(erro);
      this.logger.error(`Falha ao enviar e-mail para ${input.to}: ${erroMsg}`);
      capturarErro(erro, 'mail.sendMail', { assunto: input.subject });
    } finally {
      // Log do envio (T-193). Best-effort; o MailLogService engole o próprio erro.
      void this.mailLog?.registrar({
        para: input.to,
        assunto: input.subject,
        provedor,
        status,
        erro: erroMsg,
      });
    }
  }

  // Resend por HTTPS. `fetch` nativo — sem SDK, sem dependência nova.
  private async enviarPorHttp(input: MailInput, apiKey: string): Promise<void> {
    const resposta = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!resposta.ok) {
      // O corpo do erro diz o que houve (domínio não verificado, chave inválida)
      // — sem ele o log viraria um "400" mudo, que não ajuda ninguém.
      const corpo = await resposta.text().catch(() => '');
      throw new Error(`Resend respondeu ${resposta.status}: ${corpo}`);
    }
  }

  private logOnly(input: MailInput): void {
    if (!this.avisouLogOnly) {
      this.logger.warn(
        'E-mail não configurado (sem RESEND_API_KEY nem SMTP_HOST) — e-mails só serão logados.',
      );
      this.avisouLogOnly = true;
    }
    this.logger.log(`[log-only] Para: ${input.to} · Assunto: ${input.subject}`);
  }

  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
