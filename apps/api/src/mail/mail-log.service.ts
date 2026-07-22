import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailLog } from './mail-log.entity';

export interface RegistroEmail {
  para: string;
  assunto: string;
  provedor: 'resend' | 'smtp' | 'log';
  status: 'enviado' | 'falhou' | 'log';
  erro?: string | null;
}

// Write do log de e-mails (T-193). NUNCA propaga erro — registrar o log não pode
// afetar o envio (que já é best-effort). Falha ao logar morre no log.
@Injectable()
export class MailLogService {
  private readonly logger = new Logger(MailLogService.name);

  constructor(
    @InjectRepository(MailLog)
    private readonly repo: Repository<MailLog>,
  ) {}

  async registrar(r: RegistroEmail): Promise<void> {
    try {
      await this.repo.insert({
        para: r.para.slice(0, 255),
        assunto: r.assunto.slice(0, 255),
        provedor: r.provedor,
        status: r.status,
        erro: r.erro ?? null,
      });
    } catch (e) {
      this.logger.warn(
        `Falha ao registrar log de e-mail: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
