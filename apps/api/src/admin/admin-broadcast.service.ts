import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { MailService } from '../mail/mail.service';
import { emailComunicado } from '../mail/mail.templates';
import { User } from '../users/user.entity';
import { BetaBroadcast, BroadcastSegmento } from './beta-broadcast.entity';
import { SendBroadcastDto } from './dto/broadcast.dto';

export interface BroadcastPagina {
  data: BetaBroadcast[];
  total: number;
  page: number;
  pageSize: number;
}

interface Destinatario {
  email: string;
  name: string;
}

const PAGE_SIZE = 20;

// Comunicado ao beta (T-198). Resolve os destinatários por segmento, registra a
// campanha e dispara os envios em SEGUNDO PLANO (o e-mail nunca bloqueia a
// resposta, §8). O status por destinatário vive no mail_log (T-193).
@Injectable()
export class AdminBroadcastService {
  private readonly logger = new Logger(AdminBroadcastService.name);

  constructor(
    @InjectRepository(BetaBroadcast)
    private readonly broadcasts: Repository<BetaBroadcast>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly mail: MailService,
  ) {}

  // Destinatários do segmento: sempre e-mail VERIFICADO (não dá para alcançar
  // quem não confirmou), mais o filtro de status da assinatura.
  private async destinatarios(
    segmento: BroadcastSegmento,
  ): Promise<Destinatario[]> {
    const qb = this.users
      .createQueryBuilder('u')
      .select(['u.email AS email', 'u.name AS name'])
      .where('u.email_verified_at IS NOT NULL');
    if (segmento !== 'todos') {
      const status = segmento === 'trial' ? 'trialing' : 'active';
      qb.innerJoin('assinaturas', 'a', 'a.user_id = u.id').andWhere(
        'a.status = :status',
        { status },
      );
    }
    return qb.getRawMany<Destinatario>();
  }

  async preview(segmento: BroadcastSegmento): Promise<{ total: number }> {
    return { total: (await this.destinatarios(segmento)).length };
  }

  async enviar(dto: SendBroadcastDto, adminId: string): Promise<BetaBroadcast> {
    const destinatarios = await this.destinatarios(dto.segmento);
    const campanha = await this.broadcasts.save(
      this.broadcasts.create({
        assunto: dto.assunto,
        corpo: dto.corpo,
        segmento: dto.segmento,
        total: destinatarios.length,
        status: 'enviando',
        createdByAdminId: adminId,
      }),
    );
    // Fire-and-forget: a resposta sai já com a campanha 'enviando'; o loop marca
    // 'concluido' ao fim. Nunca derruba a resposta HTTP.
    void this.dispararEnvios(campanha, dto, destinatarios);
    return campanha;
  }

  private async dispararEnvios(
    campanha: BetaBroadcast,
    dto: SendBroadcastDto,
    destinatarios: Destinatario[],
  ): Promise<void> {
    const { html, text } = emailComunicado(dto.corpo);
    try {
      for (const d of destinatarios) {
        // sendMail nunca propaga e já registra cada envio no mail_log (T-193).
        await this.mail.sendMail({
          to: d.email,
          subject: dto.assunto,
          html,
          text,
        });
      }
    } catch (erro) {
      // Não deveria acontecer (sendMail engole tudo), mas é rede de segurança.
      capturarErro(erro, 'admin.broadcast.envio', { campanha: campanha.id });
      this.logger.error(`Falha no envio do comunicado ${campanha.id}`);
    } finally {
      await this.broadcasts.update(campanha.id, { status: 'concluido' });
    }
  }

  async listar(page: number): Promise<BroadcastPagina> {
    const [data, total] = await this.broadcasts.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { data, total, page, pageSize: PAGE_SIZE };
  }
}
