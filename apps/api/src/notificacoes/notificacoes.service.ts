import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AlertaCat } from '../alertas/alertas.types';
import { AlertasService } from '../alertas/alertas.service';
import { CompanyProfileService } from '../company-profile/company-profile.service';
import {
  emailNotificacoes,
  emailObraDoDia,
  NotificacaoItem,
} from '../mail/mail.templates';
import { MailService } from '../mail/mail.service';
import { DEFAULT_NOTIFICATION_PREFS, User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
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
    private readonly companyProfile: CompanyProfileService,
    private readonly usersService: UsersService,
  ) {}

  private base(): string {
    return this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
  }

  // Roda diariamente. No Render free o @Cron não é confiável (hiberna) — o
  // endpoint manual (POST /notificacoes/run) permite um cron externo disparar.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async cronDiario(): Promise<void> {
    await this.enviarPendentes().catch((e) =>
      this.logger.error(`Notificações (cron) falharam: ${this.msg(e)}`),
    );
    await this.enviarObraDoDia().catch((e) =>
      this.logger.error(`Obra do dia (cron) falhou: ${this.msg(e)}`),
    );
  }

  // Usuários que podem receber e-mail: verificado (T-132) + toggle ligado (T-89).
  private async usuariosNotificaveis(): Promise<User[]> {
    const candidatos = await this.users.find({
      where: { emailVerifiedAt: Not(IsNull()) },
      select: {
        id: true,
        name: true,
        email: true,
        uf: true,
        notificationPrefs: true,
      },
    });
    return candidatos.filter(
      (u) => (u.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS).email,
    );
  }

  // Envia as notificações de urgência pendentes (T-103). Retorna quantos e-mails.
  async enviarPendentes(): Promise<number> {
    const base = this.base();
    let enviados = 0;
    for (const user of await this.usuariosNotificaveis()) {
      try {
        if (await this.notificarUsuario(user, base)) enviados++;
      } catch (e) {
        this.logger.warn(`Falha ao notificar ${user.id}: ${this.msg(e)}`);
      }
    }
    if (enviados > 0) this.logger.log(`Notificações enviadas: ${enviados}.`);
    return enviados;
  }

  // "Melhor obra pra você hoje" (T-135): 1 e-mail/dia com a obra APTA nova mais
  // recente da região do usuário (mesmo critério da T-95), sobre editais já
  // analisados (veredito real). Não repete a mesma obra (log por edital).
  async enviarObraDoDia(): Promise<number> {
    const base = this.base();
    let enviados = 0;
    for (const user of await this.usuariosNotificaveis()) {
      if (!user.uf) continue; // sem região, sem "obra do dia"
      try {
        if (await this.obraDoDiaParaUsuario(user, base)) enviados++;
      } catch (e) {
        this.logger.warn(`Obra do dia falhou para ${user.id}: ${this.msg(e)}`);
      }
    }
    if (enviados > 0) this.logger.log(`Obras do dia enviadas: ${enviados}.`);
    return enviados;
  }

  private async obraDoDiaParaUsuario(
    user: Pick<User, 'id' | 'name' | 'email' | 'uf'>,
    base: string,
  ): Promise<boolean> {
    const municipios = await this.usersService.getMunicipiosPreferidos(user.id);
    const { data } = await this.companyProfile.getEditaisAptos(user.id, {
      uf: user.uf ? [user.uf] : undefined,
      codigoIbge: municipios.length
        ? municipios.map((m) => m.codigoIbge)
        : undefined,
      somenteAbertos: true, // não manda obra já encerrada como "de hoje"
      page: 1,
      pageSize: 50,
    });
    // Só APTO (não "quase"), na ordem de recência que o filtro já devolve.
    const aptos = data.filter((e) => e.veredito === 'apto');
    if (aptos.length === 0) return false;

    const jaEnviados = new Set(
      (
        await this.log.find({
          where: {
            userId: user.id,
            alertaId: In(aptos.map((e) => `obra_do_dia:${e.id}`)),
          },
          select: { alertaId: true },
        })
      ).map((l) => l.alertaId),
    );
    const obra = aptos.find((e) => !jaEnviados.has(`obra_do_dia:${e.id}`));
    if (!obra) return false;

    await this.mail.sendMail({
      to: user.email,
      ...emailObraDoDia(
        user.name,
        {
          objeto: obra.objeto,
          orgaoNome: obra.orgaoNome,
          municipioNome: obra.municipioNome,
          uf: obra.uf,
          modalidadeNome: obra.modalidadeNome,
          valorLabel: this.valorCompacto(obra.valorEstimado),
          prazoLabel: this.prazoRelativo(obra.prazoProposta),
          sessaoLabel: this.sessaoLabel(obra.prazoProposta),
        },
        `${base}/editais/${obra.id}`,
      ),
    });
    await this.log
      .createQueryBuilder()
      .insert()
      .into(NotificationLog)
      .values({
        userId: user.id,
        alertaId: `obra_do_dia:${obra.id}`,
        canal: 'email',
      })
      .orIgnore()
      .execute();
    return true;
  }

  // "R$ 1,2 mi" / "R$ 350 mil" / "R$ 8.000" — compacto para o e-mail. null → null.
  private valorCompacto(valor: number | null): string | null {
    if (valor == null) return null;
    if (valor >= 1_000_000)
      return `R$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')} mi`;
    if (valor >= 100_000) return `R$ ${Math.round(valor / 1000)} mil`;
    return `R$ ${valor.toLocaleString('pt-BR')}`;
  }

  // "em 14 dias" / "amanhã" / "hoje" — prazo relativo p/ o card da obra do dia.
  private prazoRelativo(prazo: Date | null): string | null {
    if (!prazo) return null;
    const ms = new Date(prazo).getTime() - Date.now();
    const dias = Math.ceil(ms / 86_400_000);
    if (dias < 0) return null;
    if (dias === 0) return 'hoje';
    if (dias === 1) return 'amanhã';
    return `em ${dias} dias`;
  }

  // "23/07 09:00" (fuso de Brasília) — data/hora da sessão. null quando ausente.
  private sessaoLabel(prazo: Date | null): string | null {
    if (!prazo) return null;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(prazo))
      .replace(',', '');
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
