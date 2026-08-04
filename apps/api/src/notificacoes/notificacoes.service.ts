import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, Not, Repository } from 'typeorm';
import { AlertaCat } from '../alertas/alertas.types';
import { AlertasService } from '../alertas/alertas.service';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AssinaturasService } from '../assinaturas/assinaturas.service';
import { fimDaCarencia } from '../assinaturas/acesso';
import {
  AsaasBillingService,
  CobrancaAsaas,
} from '../assinaturas/asaas-billing.service';
import { StripeBillingService } from '../assinaturas/stripe-billing.service';
import { CompanyProfileService } from '../company-profile/company-profile.service';
import { EditalListItem } from '../editais/dto/edital-search-response';
import { EditaisSearchService } from '../editais/editais-search.service';
import {
  emailCompletePerfil,
  emailNotificacoes,
  emailObrasDaRegiao,
  emailAcessoVaiCair,
  emailCobrancaVencendo,
  emailPagamentoFalhou,
  emailRenovacaoAnual,
  emailTrialAcabando,
  MeioCobranca,
  NotificacaoItem,
  ObraResumo,
} from '../mail/mail.templates';
import { MailLog } from '../mail/mail-log.entity';
import { MailService } from '../mail/mail.service';
import { DEFAULT_NOTIFICATION_PREFS, User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { capturarErro } from '../common/observabilidade';
import {
  gerarTokenDescadastro,
  verificarTokenDescadastro,
} from './descadastro-token';
import { NotificationLog } from './notification-log.entity';

// Categorias de alerta que geram e-mail (T-103): urgências acionáveis. As
// passivas (resumo IA pronto, resultado da proposta) ficam só no sino.
const CATS_NOTIFICAVEIS: AlertaCat[] = ['documento', 'prazo'];

// Antecedência do aviso de renovação anual (T-158). É uma JANELA, não um dia
// exato: o @Cron hiberna no free tier (§8) e o aviso não pode sumir porque a
// máquina dormiu no 7º dia.
const DIAS_AVISO_RENOVACAO = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

// Dias de CALENDÁRIO (UTC) entre duas datas — usado para escalonar o aviso de
// trial (D-3/D-1/D-0). "Acaba hoje" = 0, "amanhã" = 1, imune à hora do dia.
function diasDeCalendario(de: Date, ate: Date): number {
  const d0 = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate());
  const d1 = Date.UTC(
    ate.getUTCFullYear(),
    ate.getUTCMonth(),
    ate.getUTCDate(),
  );
  return Math.round((d1 - d0) / DIA_MS);
}

// Envio real de notificações por e-mail (BACKLOG T-103). Deriva os alertas de
// cada usuário (reusa T-90), filtra os acionáveis ainda não enviados (log
// anti-duplicação) e manda um e-mail-resumo, respeitando as preferências (T-89).
// WhatsApp fica de fora até haver provedor (decisão do dono).
// Janelas da régua de inadimplência (T-220). Ficam aqui, nomeadas, porque são
// prazo de COBRANÇA: número solto no meio de um `if` é o que faz a régua mudar
// sem ninguém perceber.
//
// ⚠️ O corte em si NÃO é decidido aqui — quem barra é `calcularAcesso`, com a
// `PAST_DUE_CARENCIA_DIAS`. Estas constantes só dizem QUANDO avisar.
const DIAS_AVISO_PRE_VENCIMENTO = 3;
const DIAS_AVISO_CORTE = 2;

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
    @InjectRepository(MailLog)
    private readonly mailLog: Repository<MailLog>,
    private readonly alertas: AlertasService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly companyProfile: CompanyProfileService,
    private readonly usersService: UsersService,
    private readonly assinaturas: AssinaturasService,
    private readonly billing: StripeBillingService,
    // Régua de inadimplência (T-220): é dele que vem o MEIO de pagamento, que
    // decide o texto de cada aviso.
    private readonly asaas: AsaasBillingService,
    private readonly editaisSearch: EditaisSearchService,
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
    // Quantas contas PODEM receber (e-mail verificado + toggle ligado). Serve para
    // o admin distinguir "0 elegíveis" de "elegíveis, mas nada acionável".
    usuariosNotificaveis: number;
    alertas: number;
    obrasDoDia: number;
    renovacoes: number;
    trialAcabando: number;
    completePerfil: number;
    dunning: number;
    // Régua de inadimplência (T-220): os dois avisos que faltavam.
    vencimentoProximo: number;
    corteIminente: number;
  } | null> {
    if (this.running) {
      this.logger.warn('Notificações já em execução — disparo ignorado.');
      return null;
    }
    this.running = true;
    try {
      const usuariosNotificaveis = (await this.usuariosNotificaveis()).length;
      const alertas = await this.enviarPendentes();
      const obrasDoDia = await this.enviarObraDoDia();
      const renovacoes = await this.enviarAvisosRenovacaoAnual().catch(() => 0);
      // E-mails de ciclo de vida (T-135x): isolados em catch para não perder o
      // disparo inteiro se um deles falhar.
      const trialAcabando = await this.enviarTrialAcabando().catch(() => 0);
      const completePerfil = await this.enviarCompletePerfil().catch(() => 0);
      const dunning = await this.enviarDunning().catch(() => 0);
      const vencimentoProximo = await this.avisarVencimentoProximo().catch(
        () => 0,
      );
      const corteIminente = await this.avisarCorteIminente().catch(() => 0);
      return {
        usuariosNotificaveis,
        alertas,
        obrasDoDia,
        renovacoes,
        trialAcabando,
        completePerfil,
        dunning,
        vencimentoProximo,
        corteIminente,
      };
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
    await this.enviarTrialAcabando().catch((e) => {
      capturarErro(e, 'notificacoes.trialAcabando');
      this.logger.error(`Trial acabando (cron) falhou: ${this.msg(e)}`);
    });
    await this.enviarCompletePerfil().catch((e) => {
      capturarErro(e, 'notificacoes.completePerfil');
      this.logger.error(`Complete perfil (cron) falhou: ${this.msg(e)}`);
    });
    await this.enviarDunning().catch((e) => {
      capturarErro(e, 'notificacoes.dunning');
      this.logger.error(`Dunning (cron) falhou: ${this.msg(e)}`);
    });
    // ⚠️ Isolados como os demais: um provedor fora do ar não pode levar junto os
    // outros avisos da régua. E o de CORTE é o mais caro de perder — sem ele,
    // alguém é bloqueado sem aviso, que é exatamente o que a T-220 proíbe.
    await this.avisarVencimentoProximo().catch((e) => {
      capturarErro(e, 'notificacoes.vencimentoProximo');
      this.logger.error(`Aviso de vencimento (cron) falhou: ${this.msg(e)}`);
    });
    await this.avisarCorteIminente().catch((e) => {
      capturarErro(e, 'notificacoes.corteIminente');
      this.logger.error(`Aviso de corte (cron) falhou: ${this.msg(e)}`);
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

  // E-mail diário de "obras da sua região" (T-135, ampliado — decisão do dono).
  // SEMPRE sai (1/dia por conta) para quem tem e-mail verificado + toggle + UF —
  // inclusive quem não tem docs, que recebe as obras da região + um CTA para
  // completar o perfil. Sem isso, quem não preenche o perfil nunca receberia nada.
  async enviarObraDoDia(now: Date = new Date()): Promise<number> {
    const base = this.base();
    // Elegíveis: e-mail verificado + master ligado (usuariosNotificaveis) + UF +
    // o toggle específico de obra do dia não desligado (descadastro, T-135).
    const usuarios = (await this.usuariosNotificaveis()).filter(
      (u) =>
        u.uf &&
        (u.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS).obraDoDia !== false,
    );
    if (usuarios.length === 0) return 0;

    // Supressão de entrega: pula quem já deu bounce ou reclamou (T-193) — mandar
    // para caixa morta / quem reclamou é o que mais destrói a reputação de envio.
    const suprimidos = await this.emailsSuprimidos(
      usuarios.map((u) => u.email),
    );

    let enviados = 0;
    for (const user of usuarios) {
      if (suprimidos.has(user.email.toLowerCase())) continue;
      try {
        if (await this.obraDoDiaParaUsuario(user, base, now)) enviados++;
      } catch (e) {
        this.logger.warn(
          `Obra da região falhou para ${user.id}: ${this.msg(e)}`,
        );
      }
    }
    if (enviados > 0) this.logger.log(`Obras da região enviadas: ${enviados}.`);
    return enviados;
  }

  // E-mails com bounce/reclamação registrados no mail_log (T-193). Suprimidos do
  // envio de marketing para proteger a reputação (lowercase para casar).
  private async emailsSuprimidos(emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const rows = await this.mailLog.find({
      where: {
        para: In(emails),
        deliveryStatus: In(['bounce', 'reclamacao']),
      },
      select: { para: true },
    });
    return new Set(rows.map((r) => r.para.toLowerCase()));
  }

  private get unsubSecret(): string {
    return this.config.get<string>('JWT_ACCESS_SECRET', 'dev-unsub-secret');
  }

  private apiBase(): string {
    return this.config.get<string>('API_ORIGIN', 'http://localhost:3000');
  }

  // Descadastro do e-mail de obra do dia por token (sem login, T-135). Desliga SÓ
  // `obraDoDia`, preservando o master e os alertas de urgência. Reversível no app.
  async descadastrarObraDoDia(token: string): Promise<boolean> {
    const userId = verificarTokenDescadastro(token, this.unsubSecret);
    if (!userId) return false;
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, notificationPrefs: true },
    });
    if (!user) return false;
    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...(user.notificationPrefs ?? {}),
      obraDoDia: false,
    };
    await this.users.update(userId, { notificationPrefs: prefs });
    this.logger.log(`Descadastro de obra do dia: ${userId}.`);
    return true;
  }

  // ---- E-mails de ciclo de vida (conta/dinheiro) — TRANSACIONAIS ----
  // Não respeitam o toggle de marketing (como a renovação T-158): a pessoa
  // PRECISA saber. Exigem e-mail verificado. Dedup pelo notification_log.

  private async enviadoAntes(
    userId: string,
    alertaId: string,
  ): Promise<boolean> {
    return (await this.log.findOne({ where: { userId, alertaId } })) != null;
  }

  private async registrarEnvio(
    userId: string,
    alertaId: string,
  ): Promise<void> {
    await this.log
      .createQueryBuilder()
      .insert()
      .into(NotificationLog)
      .values({ userId, alertaId, canal: 'email' })
      .orIgnore()
      .execute();
  }

  private async usuariosVerificados(ids: string[]): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();
    const users = await this.users.find({
      where: { id: In(ids), emailVerifiedAt: Not(IsNull()) },
      select: { id: true, name: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u]));
  }

  // "Seu teste acaba em X" — escalonado em D-3, D-1 e no dia (dedup por estágio).
  async enviarTrialAcabando(now: Date = new Date()): Promise<number> {
    const base = this.base();
    const subs = await this.assinaturas.trialsExpirandoAte(3, now);
    const users = await this.usuariosVerificados(subs.map((s) => s.userId));
    let enviados = 0;
    for (const s of subs) {
      const user = s.trialEndsAt ? users.get(s.userId) : undefined;
      if (!user || !s.trialEndsAt) continue;
      const dias = diasDeCalendario(now, s.trialEndsAt);
      const label =
        dias === 3
          ? 'em 3 dias'
          : dias === 1
            ? 'amanhã'
            : dias === 0
              ? 'hoje'
              : null;
      if (label === null) continue; // só D-3, D-1, D-0
      const alertaId = `trial_fim:d${dias}`;
      if (await this.enviadoAntes(user.id, alertaId)) continue;
      try {
        await this.mail.sendMail({
          to: user.email,
          ...emailTrialAcabando(user.name, label, `${base}/assinatura`),
        });
        await this.registrarEnvio(user.id, alertaId);
        enviados++;
      } catch (e) {
        this.logger.warn(`Trial acabando falhou p/ ${user.id}: ${this.msg(e)}`);
      }
    }
    if (enviados > 0) this.logger.log(`Avisos de trial acabando: ${enviados}.`);
    return enviados;
  }

  // "Complete seu perfil" — 1×, para conta verificada de 2–14 dias SEM documentos
  // (a janela de idade limita o disparo inicial só aos cadastros recentes).
  async enviarCompletePerfil(now: Date = new Date()): Promise<number> {
    const candidatos = await this.users.find({
      where: {
        emailVerifiedAt: Not(IsNull()),
        createdAt: Between(
          new Date(now.getTime() - 14 * DIA_MS),
          new Date(now.getTime() - 2 * DIA_MS),
        ),
      },
      select: { id: true, name: true, email: true },
    });
    const base = this.base();
    let enviados = 0;
    for (const user of candidatos) {
      if (await this.enviadoAntes(user.id, 'complete_perfil')) continue;
      if (await this.companyProfile.temDocumentos(user.id)) continue; // já subiu
      try {
        await this.mail.sendMail({
          to: user.email,
          ...emailCompletePerfil(user.name, `${base}/perfil`),
        });
        await this.registrarEnvio(user.id, 'complete_perfil');
        enviados++;
      } catch (e) {
        this.logger.warn(
          `Complete perfil falhou p/ ${user.id}: ${this.msg(e)}`,
        );
      }
    }
    if (enviados > 0)
      this.logger.log(`Nudges de completar perfil: ${enviados}.`);
    return enviados;
  }

  /**
   * A régua de inadimplência (T-220), em três momentos.
   *
   * 🔴 O que a torna diferente de "mandar e-mail quando falha" é o MEIO. Cartão
   * retenta sozinho; **boleto e Pix não acontecem se ninguém pagar**. A régua
   * antiga tratava todo mundo como cartão — dizia "vamos tentar de novo
   * automaticamente" a quem tinha um boleto parado, e a pessoa esperava um
   * resgate que nunca vinha. É o mesmo defeito que o `9589c16` corrigiu na
   * tela; ele sobreviveu aqui.
   *
   * Os três avisos e por que cada um existe:
   *   1. **PRÉ-vencimento** (só cobrança manual): o primeiro contato não pode
   *      ser depois de a pessoa já estar inadimplente;
   *   2. **falha**: 1× por episódio, com o texto e o link certos para o meio;
   *   3. **corte iminente**: o critério do backlog é literal — *nenhum cliente
   *      é bloqueado sem ter sido avisado*. Antes havia um e-mail no dia 0 e o
   *      acesso caía sete dias depois, em silêncio.
   *
   * ⚠️ O `meio` vem das cobranças em aberto do provedor, numa leitura só para
   * toda a régua. Sem elas (Asaas fora do ar), o aviso ainda sai com o texto de
   * cartão, que é o padrão histórico — avisar de menos é pior que avisar com o
   * texto genérico.
   */
  private async cobrancasDaRegua(
    now: Date,
  ): Promise<Map<string, CobrancaAsaas>> {
    try {
      return await this.asaas.cobrancasAbertasPorAssinatura(10, now);
    } catch (e) {
      this.logger.warn(`Régua sem dados de cobrança: ${this.msg(e)}`);
      return new Map();
    }
  }

  private meioDaCobranca(cobranca?: CobrancaAsaas): MeioCobranca {
    // `UNDEFINED` é o modo em que o pagador escolhe boleto ou Pix (T-208) —
    // manual, portanto. Sem informação, cartão: é o padrão histórico e o texto
    // que não promete pagamento manual a quem não precisa fazer nada.
    if (!cobranca?.meio) return 'cartao';
    return cobranca.meio === 'CREDIT_CARD' ? 'cartao' : 'manual';
  }

  /**
   * Aviso PRÉ-vencimento — **só cobrança manual** (T-220).
   *
   * Para cartão seria ruído: a cobrança acontece sozinha, e quem é anual já
   * recebe o `emailRenovacaoAnual`. Boleto e Pix é que precisam de lembrete,
   * porque dependem de alguém agir.
   */
  async avisarVencimentoProximo(now: Date = new Date()): Promise<number> {
    const cobrancas = await this.cobrancasDaRegua(now);
    if (cobrancas.size === 0) return 0;
    const subs = await this.assinaturas.comAssinaturaAsaas();
    const users = await this.usuariosVerificados(subs.map((s) => s.userId));
    let enviados = 0;
    for (const s of subs) {
      const cobranca = s.asaasSubscriptionId
        ? cobrancas.get(s.asaasSubscriptionId)
        : undefined;
      const user = users.get(s.userId);
      if (!user || !cobranca?.vencimento || !cobranca.pagarUrl) continue;
      if (this.meioDaCobranca(cobranca) !== 'manual') continue;
      const dias = this.diasAte(cobranca.vencimento, now);
      // Janela de 1 a 3 dias: antes disso é cedo demais para ser útil, e depois
      // do vencimento quem fala é o dunning, não este aviso.
      if (dias < 1 || dias > DIAS_AVISO_PRE_VENCIMENTO) continue;
      // Chave pela COBRANÇA: no ciclo seguinte é outra, e a pessoa é avisada de
      // novo. Uma chave por assinatura avisaria uma vez na vida.
      const alertaId = `cobranca_vencendo:${cobranca.id ?? cobranca.vencimento.toISOString()}`;
      if (await this.enviadoAntes(user.id, alertaId)) continue;
      try {
        await this.mail.sendMail({
          to: user.email,
          ...emailCobrancaVencendo(
            user.name,
            {
              valorLabel: this.precoBRL(cobranca.valor),
              dataLabel: this.dataLabel(cobranca.vencimento),
              quandoLabel:
                this.prazoRelativo(cobranca.vencimento, now) ?? 'em breve',
            },
            cobranca.pagarUrl,
          ),
        });
        await this.registrarEnvio(user.id, alertaId);
        enviados++;
      } catch (e) {
        this.logger.warn(
          `Aviso de vencimento falhou p/ ${user.id}: ${this.msg(e)}`,
        );
      }
    }
    if (enviados > 0)
      this.logger.log(`Avisos de vencimento próximo: ${enviados}.`);
    return enviados;
  }

  // "Não conseguimos cobrar" — 1× por EPISÓDIO de past_due (dedup pela data em que
  // começou a falhar; um novo episódio depois de recuperar re-envia).
  async enviarDunning(now: Date = new Date()): Promise<number> {
    const base = this.base();
    const subs = await this.assinaturas.emPastDue();
    const users = await this.usuariosVerificados(subs.map((s) => s.userId));
    const cobrancas = await this.cobrancasDaRegua(now);
    let enviados = 0;
    for (const s of subs) {
      const user = s.pastDueDesde ? users.get(s.userId) : undefined;
      if (!user || !s.pastDueDesde) continue;
      const alertaId = `dunning:${s.pastDueDesde.toISOString().slice(0, 10)}`;
      if (await this.enviadoAntes(user.id, alertaId)) continue;
      const cobranca = s.asaasSubscriptionId
        ? cobrancas.get(s.asaasSubscriptionId)
        : undefined;
      try {
        await this.mail.sendMail({
          to: user.email,
          ...emailPagamentoFalhou(user.name, `${base}/assinatura`, {
            meio: this.meioDaCobranca(cobranca),
            pagarUrl: cobranca?.pagarUrl,
          }),
        });
        await this.registrarEnvio(user.id, alertaId);
        enviados++;
      } catch (e) {
        this.logger.warn(`Dunning falhou p/ ${user.id}: ${this.msg(e)}`);
      }
    }
    if (enviados > 0)
      this.logger.log(`Avisos de pagamento falho: ${enviados}.`);
    return enviados;
  }

  /**
   * Último aviso antes do bloqueio (T-220).
   *
   * 🔴 A DATA vem de `fimDaCarencia` — a MESMA função que o `calcularAcesso`
   * usa para barrar (§3.3). Recalcular o prazo aqui faria o e-mail prometer um
   * dia e o paywall cortar noutro, que é a pior forma de perder a confiança de
   * quem está prestes a pagar.
   */
  async avisarCorteIminente(now: Date = new Date()): Promise<number> {
    const base = this.base();
    const subs = await this.assinaturas.emPastDue();
    const users = await this.usuariosVerificados(subs.map((s) => s.userId));
    const cobrancas = await this.cobrancasDaRegua(now);
    let enviados = 0;
    for (const s of subs) {
      const user = users.get(s.userId);
      const corte = fimDaCarencia(s.pastDueDesde ?? null);
      if (!user || !corte) continue;
      const dias = this.diasAte(corte, now);
      // Janela: de 1 a 2 dias antes do corte. Zero ou negativo já é o bloqueio
      // acontecendo — avisar ali não dá tempo de agir.
      if (dias < 1 || dias > DIAS_AVISO_CORTE) continue;
      // Chave pelo EPISÓDIO, como o dunning: um novo past_due avisa de novo.
      const alertaId = `corte_iminente:${s.pastDueDesde!.toISOString().slice(0, 10)}`;
      if (await this.enviadoAntes(user.id, alertaId)) continue;
      const cobranca = s.asaasSubscriptionId
        ? cobrancas.get(s.asaasSubscriptionId)
        : undefined;
      const meio = this.meioDaCobranca(cobranca);
      try {
        await this.mail.sendMail({
          to: user.email,
          ...emailAcessoVaiCair(
            user.name,
            {
              dataLabel: this.dataLabel(corte),
              quandoLabel: this.prazoRelativo(corte, now) ?? 'em breve',
            },
            (meio === 'manual' && cobranca?.pagarUrl) || `${base}/assinatura`,
            meio,
          ),
        });
        await this.registrarEnvio(user.id, alertaId);
        enviados++;
      } catch (e) {
        this.logger.warn(`Aviso de corte falhou p/ ${user.id}: ${this.msg(e)}`);
      }
    }
    if (enviados > 0) this.logger.log(`Avisos de corte iminente: ${enviados}.`);
    return enviados;
  }

  /** Dias inteiros até `data`, arredondando para CIMA — mesma regra do
   *  `calcularAcesso`: quem ainda tem 6 horas não pode ler "0 dias". */
  private diasAte(data: Date, now: Date): number {
    const ms = data.getTime() - now.getTime();
    return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
  }

  private async obraDoDiaParaUsuario(
    user: Pick<User, 'id' | 'name' | 'email' | 'uf'>,
    base: string,
    now: Date,
  ): Promise<boolean> {
    // 1 e-mail/dia por conta: apertar o botão 2x no mesmo dia não duplica.
    const diaKey = `regiao_diaria:${now.toISOString().slice(0, 10)}`;
    if (
      await this.log.findOne({ where: { userId: user.id, alertaId: diaKey } })
    ) {
      return false;
    }

    const municipios = await this.usersService.getMunicipiosPreferidos(user.id);
    const filtro = {
      uf: user.uf ? [user.uf] : undefined,
      codigoIbge: municipios.length
        ? municipios.map((m) => m.codigoIbge)
        : undefined,
      somenteAbertos: true, // não mostra obra já encerrada como "de hoje"
      page: 1,
      pageSize: 12,
    };

    // Camada 1: obra APTA (só existe se o usuário tem perfil que a torne apta).
    const { data: aptos } = await this.companyProfile.getEditaisAptos(
      user.id,
      filtro,
    );
    const apto = aptos.find((e) => e.veredito === 'apto') ?? null;

    // Obras da região (todas as recentes) — manchete de fallback + lista.
    const { data: regiao } = await this.editaisSearch.search(filtro);

    let headline: EditalListItem | null;
    const ehApto = apto != null;
    if (apto) {
      headline = apto;
    } else {
      // Rotação: evita repetir como manchete uma obra já destacada antes, quando
      // há alternativa (a lista abaixo pode repetir; a manchete gira).
      const jaDestacadas = await this.headlinesJaEnviadas(
        user.id,
        regiao.map((e) => e.id),
      );
      headline =
        regiao.find((e) => !jaDestacadas.has(`obra_do_dia:${e.id}`)) ??
        regiao[0] ??
        null;
    }

    const outras = regiao
      .filter((e) => e.id !== headline?.id)
      .slice(0, 4)
      .map((e) => this.mapObraResumo(e, base));

    // Descadastro em 1 clique (T-135): link no rodapé + cabeçalho List-Unsubscribe
    // (RFC 8058) que o Gmail/Yahoo usam para o botão nativo. Aponta para a API.
    const token = gerarTokenDescadastro(user.id, this.unsubSecret);
    const descadastrarUrl = `${this.apiBase()}/notificacoes/descadastrar?token=${token}`;

    await this.mail.sendMail({
      to: user.email,
      headers: {
        'List-Unsubscribe': `<${descadastrarUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      ...emailObrasDaRegiao(user.name, {
        apto: ehApto,
        headline: headline ? this.mapObraResumo(headline, base) : null,
        outras,
        perfilHref: `${base}/perfil`,
        descadastrarHref: descadastrarUrl,
      }),
    });

    // Registra o dia (dedup) + a manchete (rotação), best-effort.
    const registros: Array<{
      userId: string;
      alertaId: string;
      canal: string;
    }> = [{ userId: user.id, alertaId: diaKey, canal: 'email' }];
    if (headline && !ehApto) {
      registros.push({
        userId: user.id,
        alertaId: `obra_do_dia:${headline.id}`,
        canal: 'email',
      });
    }
    await this.log
      .createQueryBuilder()
      .insert()
      .into(NotificationLog)
      .values(registros)
      .orIgnore()
      .execute();
    return true;
  }

  // Manchetes de obra já enviadas antes a este usuário (para a rotação).
  private async headlinesJaEnviadas(
    userId: string,
    editalIds: string[],
  ): Promise<Set<string>> {
    if (editalIds.length === 0) return new Set();
    const rows = await this.log.find({
      where: {
        userId,
        alertaId: In(editalIds.map((id) => `obra_do_dia:${id}`)),
      },
      select: { alertaId: true },
    });
    return new Set(rows.map((l) => l.alertaId));
  }

  private mapObraResumo(e: EditalListItem, base: string): ObraResumo {
    return {
      objeto: e.objeto,
      orgaoNome: e.orgaoNome,
      municipioNome: e.municipioNome,
      uf: e.uf,
      modalidadeNome: e.modalidadeNome,
      valorLabel: this.valorCompacto(e.valorEstimado),
      prazoLabel: this.prazoRelativo(e.prazoProposta),
      sessaoLabel: this.sessaoLabel(e.prazoProposta),
      href: `${base}/editais/${e.id}`,
    };
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

    // 🔴 O preço vem do PROVEDOR QUE COBRA ESTA CONTA, nunca do nosso banco
    // (T-131) e nunca de um provedor só (T-222). Ler sempre a Stripe, como era,
    // anunciava o preço dela a assinante do Asaas — e o comentário que estava
    // aqui já dizia por que isso é grave: **e-mail de cobrança com valor errado
    // é pior que e-mail nenhum**. O valor anunciado tem que ser o debitado.
    //
    // Cada provedor é lido UMA vez, não por assinante: são chamadas de rede, e o
    // lote pode ter dezenas de contas.
    const base = this.base();
    const precoPorProvider = new Map<string, number>();
    let enviados = 0;

    for (const assinatura of assinaturas) {
      try {
        const provider = assinatura.provider === 'asaas' ? 'asaas' : 'stripe';
        if (!precoPorProvider.has(provider)) {
          const precos =
            provider === 'asaas'
              ? await this.asaas.listarPrecos()
              : await this.billing.listarPrecos();
          precoPorProvider.set(provider, precos.anual.valor);
        }
        if (
          await this.avisarRenovacao(
            assinatura,
            precoPorProvider.get(provider)!,
            base,
            now,
            provider === 'asaas',
          )
        )
          enviados++;
      } catch (e) {
        // Falha de UM provedor não cancela o lote inteiro: o outro segue
        // avisando. Antes, um erro no preço derrubava todos os avisos do dia.
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
    /**
     * Cobrança do Asaas pode ser MANUAL (boleto/Pix), e aí "renova" mente:
     * nada acontece sozinho, é gerada uma cobrança que alguém precisa pagar.
     * Mesma lição da T-220, agora no aviso de renovação.
     */
    podeSerManual = false,
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
          podeSerManual,
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
