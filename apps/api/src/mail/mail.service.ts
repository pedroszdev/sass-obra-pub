import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Envio de e-mail transacional (BACKLOG T-101). Vendor-agnostic: SMTP por env
// (SMTP_HOST/PORT/USER/PASS), então o dono aponta pro provedor que quiser
// (SES/Resend/Postmark/Mailtrap). SEM SMTP configurado → degrada para log-only
// (dev), como a IA degrada sem OPENAI_API_KEY (§3.4). Nunca derruba o fluxo.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private avisouLogOnly = false;

  constructor(private readonly config: ConfigService) {}

  private get from(): string {
    return this.config.get<string>(
      'MAIL_FROM',
      'PrumoLicita <nao-responda@prumolicita.com.br>',
    );
  }

  // Cria o transporte SMTP sob demanda; null quando não há SMTP_HOST (log-only).
  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) return null;
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get('SMTP_PORT', 587)),
      secure: this.config.get('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
    return this.transporter;
  }

  // Envia (ou loga, se sem SMTP). Erros de envio são logados e NÃO propagados —
  // o "esqueci a senha" não deve vazar sucesso/falha nem quebrar por SMTP fora.
  async sendMail(input: MailInput): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) {
      if (!this.avisouLogOnly) {
        this.logger.warn(
          'SMTP não configurado (SMTP_HOST ausente) — e-mails só serão logados.',
        );
        this.avisouLogOnly = true;
      }
      this.logger.log(
        `[log-only] Para: ${input.to} · Assunto: ${input.subject}`,
      );
      return;
    }
    try {
      await transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
    } catch (erro) {
      this.logger.error(
        `Falha ao enviar e-mail para ${input.to}: ${String(erro)}`,
      );
    }
  }
}
