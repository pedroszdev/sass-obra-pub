import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  Not,
  Repository,
} from 'typeorm';
import { ConfigStoreService } from '../config/config-store.service';
import { Acesso, calcularAcesso, trialTermina } from './acesso';
import { Assinatura } from './assinatura.entity';
import { AssinaturaStatus } from './assinatura-status.enum';

// Assinatura do usuário (BACKLOG T-127). Aqui NÃO se fala com a Stripe — isso é
// a T-128. Esta camada só sabe: criar o trial no cadastro, ler o estado, e
// responder "pode usar?" (delegando à função pura de acesso, §3.3).
@Injectable()
export class AssinaturasService {
  private readonly logger = new Logger(AssinaturasService.name);

  constructor(
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    private readonly config: ConfigStoreService,
  ) {}

  // Cria o trial de 7 dias no cadastro (e-mail ou Google). IDEMPOTENTE: se já
  // existe assinatura para o usuário, não faz nada — um `orIgnore` sobre o UNIQUE
  // evita que uma corrida (dois cadastros simultâneos do mesmo e-mail) derrube o
  // cadastro com violação de chave. Nada é criado na Stripe aqui.
  async iniciarTrial(userId: string, now: Date = new Date()): Promise<void> {
    // Dias de trial configuráveis no runtime (T-195), com fallback no default 7.
    // O fim é gravado AGORA (snapshot): mudar o parâmetro depois não mexe em
    // trials já criados — só nos próximos cadastros.
    const dias = await this.config.getTrialDias();
    await this.assinaturas
      .createQueryBuilder()
      .insert()
      .values({
        userId,
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: trialTermina(now, dias),
      })
      .orIgnore()
      .execute();
  }

  findByUser(userId: string): Promise<Assinatura | null> {
    return this.assinaturas.findOne({ where: { userId } });
  }

  /**
   * Assinaturas ANUAIS que vão renovar dentro de `dias` (T-158) — a base do aviso
   * de cobrança que evita chargeback.
   *
   * A janela é `(now, now+dias]` e não "exatamente no 7º dia" porque o @Cron
   * hiberna no Render free (§8): amarrar num dia exato faria o aviso sumir sempre
   * que a máquina dormisse naquele dia. Quem já foi avisado é filtrado pelo log
   * de notificação, não por aqui.
   *
   * Fora da lista, de propósito: quem já cancelou (`cancelAtPeriodEnd` — não vai
   * renovar, avisar assustaria à toa) e quem foi reembolsado (T-157).
   */
  async anuaisRenovandoAte(
    dias: number,
    now: Date = new Date(),
  ): Promise<Assinatura[]> {
    const limite = new Date(now.getTime() + dias * 24 * 60 * 60 * 1000);
    return this.assinaturas.find({
      where: {
        plano: 'anual',
        status: AssinaturaStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        reembolsadaEm: IsNull(),
        currentPeriodEnd: And(MoreThan(now), LessThanOrEqual(limite)),
      },
    });
  }

  // Trials que ACABAM dentro de `dias` (T-159x): status trialing com trialEndsAt
  // no futuro e ≤ o limite. O e-mail de "trial acabando" busca aqui e agrupa por
  // estágio (D-3/D-1/D-0). Suspenso/cortesia não têm trial a expirar.
  async trialsExpirandoAte(
    dias: number,
    now: Date = new Date(),
  ): Promise<Assinatura[]> {
    const limite = new Date(now.getTime() + dias * 24 * 60 * 60 * 1000);
    return this.assinaturas.find({
      where: {
        status: AssinaturaStatus.TRIALING,
        suspensoEm: IsNull(),
        trialEndsAt: And(MoreThan(now), LessThanOrEqual(limite)),
      },
    });
  }

  // Assinaturas com pagamento falhando (past_due) — base do e-mail de dunning.
  async emPastDue(): Promise<Assinatura[]> {
    return this.assinaturas.find({
      where: { status: AssinaturaStatus.PAST_DUE, pastDueDesde: Not(IsNull()) },
    });
  }

  // "Pode usar o produto?" — a resposta é do BACKEND (§3.3). O front renderiza,
  // nunca decide. É isto que o paywall (T-130) vai consumir.
  async acessoDe(userId: string, now: Date = new Date()): Promise<Acesso> {
    const assinatura = await this.findByUser(userId);
    if (!assinatura) {
      // Conta sem assinatura não deveria existir (o cadastro cria, e a migration
      // fez o backfill). Se aparecer, é bug nosso — e o usuário não pode pagar o
      // preço dele em silêncio: registra e segue pela função pura.
      this.logger.warn(`Usuário ${userId} sem assinatura — verificar T-127.`);
    }
    return calcularAcesso(assinatura, now);
  }
}
