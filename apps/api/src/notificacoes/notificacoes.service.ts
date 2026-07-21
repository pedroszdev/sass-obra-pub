import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AlertaCat } from '../alertas/alertas.types';
import { AlertasService } from '../alertas/alertas.service';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AssinaturasService } from '../assinaturas/assinaturas.service';
import { StripeBillingService } from '../assinaturas/stripe-billing.service';
import { CompanyProfileService } from '../company-profile/company-profile.service';
import {
  emailNotificacoes,
  emailObraDoDia,
  emailRenovacaoAnual,
  NotificacaoItem,
} from '../mail/mail.templates';
import { MailService } from '../mail/mail.service';
import { DEFAULT_NOTIFICATION_PREFS, User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { capturarErro } from '../common/observabilidade';
import { NotificationLog } from './notification-log.entity';

// Categorias de alerta que geram e-mail (T-103): urgências acionáveis. As
// passivas (resumo IA pronto, resultado da proposta) ficam só no sino.
const CATS_NOTIFICAVEIS: AlertaCat[] = ['documento', 'prazo'];

// Antecedência do aviso de renovação anual (T-158). É uma JANELA, não um dia
// exato: o @Cron hiberna no free tier (§8) e o aviso não pode sumir porque a
// máquina dormiu no 7º dia.
const DIAS_AVISO_RENOVACAO = 7;

// Envio real de notificações por e-mail (BACKLOG T-103). Deriva os alertas de
// cada usuário (reusa T-90), filtra os acionáveis ainda não enviados (log
// anti-duplicação) e manda um e-mail-resumo, respeitando as preferências (T-89).
// WhatsApp fica de fora até haver provedor (decisão do dono).
@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  // Lock contra execução dupla do disparo (T-188): admin × cron × ops.
  private running = false;

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
    private readonly assinaturas: AssinaturasService,
    private readonly billing: StripeBillingService,
  ) {}

  private base(): string {
    return this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
  }

  /** Um envio está em andamento? (T-188.) */
  get emExecucao(): boolean {
    return this.running;
  }

  // Dispara o ciclo completo (alertas + obra do dia + aviso de renovação) com
  // lock (T-188). Usado pelo disparo do admin. Cada etapa isola o erro para não
  // perder o disparo inteiro; a renovação depende da Stripe e cai para 0 se ela
  // estiver fora. Retorna a contagem por etapa. 2ª chamada concorrente → null.
  async dispararTudo(): Promise<{
    alertas: number;
    obrasDoDia: number;
    renovacoes: number;
  } | null> {
    if (this.running) {
      this.logger.warn('Notificações já em execução — disparo ignorado.');
      return null;
    }
    this.running = true;
    try {
      const alertas = await this.enviarPendentes();
      const obrasDoDia = await this.enviarObraDoDia();
      const renovacoes = await this.enviarAvisosRenovacaoAnual().catch(() => 0);
      return { alertas, obrasDoDia, renovacoes };
    } finally {
      this.running = false;
    }
  }

  // Roda diariamente. No Render free o @Cron não é confiável (hiberna) — o
  // endpoint manual (POST /notificacoes/run) permite um cron externo disparar.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async cronDiario(): Promise<void> {
    await this.enviarPendentes().catch((e) => {
      capturarErro(e, 'notificacoes.cron');
      this.logger.error(`Notificações (cron) falharam: ${this.msg(e)}`);
    });
    await this.enviarObraDoDia().catch((e) => {
      capturarErro(e, 'notificacoes.obraDoDia');
      this.logger.error(`Obra do dia (cron) falhou: ${this.msg(e)}`);
    });
    await this.enviarAvisosRenovacaoAnual().catch((e) => {
      capturarErro(e, 'notificacoes.renovacaoAnual');
      this.logger.error(`Aviso de renovação (cron) falhou: ${this.msg(e)}`);
    });
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

  /**
   * Aviso de renovação anual (T-158): avisa alguns dias antes de cobrar.
   *
   * Por que existe: o cliente anual esquece que assinou, leva uma cobrança cheia
   * de surpresa e abre CHARGEBACK — que custa mais que o reembolso (taxa de
   * disputa + o valor + saúde da conta na Stripe).
   *
   * NÃO respeita o toggle de e-mail (T-89), de propósito: aquele switch promete
   * "certidões vencendo e prazos de entrega próximos" — alertas de produto. Ele
   * nunca prometeu silenciar cobrança, e ninguém opta por não saber o que vai ser
   * debitado. O e-mail verificado (T-132) segue obrigatório: não mandamos dado de
   * cobrança para endereço não confirmado.
   */
  async enviarAvisosRenovacaoAnual(now: Date = new Date()): Promise<number> {
    const assinaturas = await this.assinaturas.anuaisRenovandoAte(
      DIAS_AVISO_RENOVACAO,
      now,
    );
    if (assinaturas.length === 0) return 0;

    // O preço vem da Stripe (T-131) — nunca do nosso banco. Uma falha aqui
    // cancela o lote inteiro: e-mail de cobrança com valor errado é pior que
    // e-mail nenhum.
    const precos = await this.billing.listarPrecos();
    const base = this.base();
    let enviados = 0;

    for (const assinatura of assinaturas) {
      try {
        if (
          await this.avisarRenovacao(assinatura, precos.anual.valor, base, now)
        )
          enviados++;
      } catch (e) {
        this.logger.warn(
          `Aviso de renovação falhou para ${assinatura.userId}: ${this.msg(e)}`,
        );
      }
    }
    if (enviados > 0) {
      this.logger.log(`Avisos de renovação anual enviados: ${enviados}.`);
    }
    return enviados;
  }

  private async avisarRenovacao(
    assinatura: Assinatura,
    valorCentavos: number,
    base: string,
    now: Date,
  ): Promise<boolean> {
    const fim = assinatura.currentPeriodEnd;
    if (!fim) return false; // sem data não há o que avisar

    const user = await this.users.findOne({
      where: { id: assinatura.userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    if (!user?.emailVerifiedAt) return false;

    // Chave por PERÍODO, não por assinatura: no ano seguinte o `currentPeriodEnd`
    // é outro e a pessoa é avisada de novo. Uma chave só por assinatura avisaria
    // uma vez na vida.
    const alertaId = `renovacao_anual:${assinatura.id}:${fim.toISOString()}`;
    const jaEnviado = await this.log.findOne({
      where: { userId: user.id, alertaId },
      select: { alertaId: true },
    });
    if (jaEnviado) return false;

    await this.mail.sendMail({
      to: user.email,
      ...emailRenovacaoAnual(
        user.name,
        {
          valorLabel: this.precoBRL(valorCentavos),
          dataLabel: this.dataLabel(fim),
          quandoLabel: this.prazoRelativo(fim, now) ?? 'em breve',
        },
        `${base}/assinatura`,
      ),
    });
    await this.log
      .createQueryBuilder()
      .insert()
      .into(NotificationLog)
      .values({ userId: user.id, alertaId, canal: 'email' })
      .orIgnore()
      .execute();
    return true;
  }

  // Centavos (unidade da Stripe) → "R$ 1.490". Omite os centavos quando zerados.
  private precoBRL(centavos: number): string {
    const reais = centavos / 100;
    return reais.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: Number.isInteger(reais) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  // "19/07/2027" no fuso de Brasília — os timestamps são UTC e a data crua
  // mostraria o dia errado em cobrança à noite.
  private dataLabel(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(data);
  }

  // "R$ 1,2 mi" / "R$ 350 mil" / "R$ 8.000" — compacto para o e-mail. null → null.
  private valorCompacto(valor: number | null): string | null {
    if (valor == null) return null;
    if (valor >= 1_000_000)
      return `R$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')} mi`;
    if (valor >= 100_000) return `R$ ${Math.round(valor / 1000)} mil`;
    return `R$ ${valor.toLocaleString('pt-BR')}`;
  }

  // "em 14 dias" / "amanhã" / "hoje" — prazo relativo p/ o card da obra do dia e
  // para o aviso de renovação (T-158), que precisa do `now` injetável no teste.
  private prazoRelativo(
    prazo: Date | null,
    now: Date = new Date(),
  ): string | null {
    if (!prazo) return null;
    const ms = new Date(prazo).getTime() - now.getTime();
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
