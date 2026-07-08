import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AlertaCat } from '../alertas/alertas.types';
import { AlertasService } from '../alertas/alertas.service';
import { MailService } from '../mail/mail.service';
import { emailNotificacoes, NotificacaoItem } from '../mail/mail.templates';
import { DEFAULT_NOTIFICATION_PREFS, User } from '../users/user.entity';
import { NotificationLog } from './notification-log.entity';

// Categorias de alerta que geram e-mail (T-103): urgências acionáveis. As
// passivas (resumo IA pronto, resultado da proposta) ficam só no sino.
const CATS_NOTIFICAVEIS: AlertaCat[] = ['documento', 'prazo'];

// Envio real de notificações por e-mail (BACKLOG T-103). Deriva os alertas de
// cada usuário (reusa T-90), filtra os acionáveis ainda não enviados (log
// anti-duplicação) e manda um e-mail-resumo, respeitando as preferências (T-89).
// WhatsApp fica de fora até haver provedor (decisão do dono).
@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(NotificationLog)
    private readonly log: Repository<NotificationLog>,
    private readonly alertas: AlertasService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // Roda diariamente. No Render free o @Cron não é confiável (hiberna) — o
  // endpoint manual (POST /notificacoes/run) permite um cron externo disparar.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async cronDiario(): Promise<void> {
    await this.enviarPendentes().catch((e) =>
      this.logger.error(`Notificações (cron) falharam: ${this.msg(e)}`),
    );
  }

  // Envia as notificações pendentes. Retorna quantos e-mails saíram.
  async enviarPendentes(): Promise<number> {
    const base = this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
    // Só quem tem e-mail verificado (T-132) entra — não mandamos pra endereço
    // não confirmado.
    const candidatos = await this.users.find({
      where: { emailVerifiedAt: Not(IsNull()) },
      select: {
        id: true,
        name: true,
        email: true,
        notificationPrefs: true,
      },
    });

    let enviados = 0;
    for (const user of candidatos) {
      const prefs = user.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
      if (!prefs.email) continue; // respeita o toggle (T-89)
      try {
        if (await this.notificarUsuario(user, base)) enviados++;
      } catch (e) {
        this.logger.warn(`Falha ao notificar ${user.id}: ${this.msg(e)}`);
      }
    }
    if (enviados > 0) this.logger.log(`Notificações enviadas: ${enviados}.`);
    return enviados;
  }

  // Deriva os alertas do usuário, filtra os acionáveis novos e manda 1 e-mail.
  private async notificarUsuario(
    user: Pick<User, 'id' | 'name' | 'email'>,
    base: string,
  ): Promise<boolean> {
    const { itens } = await this.alertas.listar(user.id);
    const acionaveis = itens.filter((i) => CATS_NOTIFICAVEIS.includes(i.cat));
    if (acionaveis.length === 0) return false;

    // Remove os já enviados (log por alertaId estável).
    const jaEnviados = new Set(
      (
        await this.log.find({
          where: { userId: user.id, alertaId: In(acionaveis.map((a) => a.id)) },
          select: { alertaId: true },
        })
      ).map((l) => l.alertaId),
    );
    const novos = acionaveis.filter((a) => !jaEnviados.has(a.id));
    if (novos.length === 0) return false;

    const paraEmail: NotificacaoItem[] = novos.map((a) => ({
      titulo: a.titulo,
      detalhe: a.detalhe,
      // href do alerta é rota interna (ex.: /documentos); vira URL absoluta.
      url: /^https?:\/\//.test(a.href) ? a.href : `${base}${a.href}`,
    }));
    await this.mail.sendMail({
      to: user.email,
      ...emailNotificacoes(user.name, paraEmail, base),
    });

    // Registra os enviados (orIgnore contra corrida/unique).
    await this.log
      .createQueryBuilder()
      .insert()
      .into(NotificationLog)
      .values(
        novos.map((a) => ({ userId: user.id, alertaId: a.id, canal: 'email' })),
      )
      .orIgnore()
      .execute();
    return true;
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
