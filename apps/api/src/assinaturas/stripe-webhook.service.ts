import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { Assinatura } from './assinatura.entity';
import {
  estadoDaAssinatura,
  montarPatch,
  userIdDaSubscription,
} from './stripe-mapper';
import { StripeEvent } from './stripe-event.entity';
import { STRIPE_CLIENT } from './stripe.provider';

// Webhook da Stripe (BACKLOG T-129) — a FONTE DA VERDADE do pagamento.
//
// É aqui, e só aqui, que alguém sai de `trialing` e vira `active`. O retorno do
// navegador (`success_url`) não prova nada: o usuário pode digitá-lo na barra de
// endereços. Se este webhook não chegar, o cliente pagou e continua bloqueado —
// é o pior bug possível deste épico, e é contra ele que existe a reconciliação
// (T-143).
//
// Três coisas que a Stripe FAZ (não "pode fazer") e o código trata:
//   1. reentrega o mesmo evento  → idempotência pela PK `stripe_events.id`;
//   2. entrega FORA DE ORDEM     → carimbo `stripe_atualizado_em`, evento velho
//                                   não sobrescreve estado novo;
//   3. manda corpo de terceiro   → assinatura verificada com o corpo CRU.
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe | null,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(StripeEvent)
    private readonly eventos: Repository<StripeEvent>,
    private readonly config: ConfigService,
  ) {}

  // Verifica a assinatura do evento com o corpo CRU. Sem isto, qualquer um forja
  // um "pagamento aprovado" com um POST — é a única coisa que separa um evento
  // da Stripe de um evento inventado.
  verificar(
    corpoCru: Buffer,
    assinaturaHeader: string | undefined,
  ): Stripe.Event {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Cobrança não configurada.');
    }
    const segredo = this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
    if (!segredo) {
      throw new ServiceUnavailableException(
        'Webhook não configurado: defina STRIPE_WEBHOOK_SECRET.',
      );
    }
    if (!assinaturaHeader) {
      throw new BadRequestException('Assinatura ausente.');
    }
    try {
      return this.stripe.webhooks.constructEvent(
        corpoCru,
        assinaturaHeader,
        segredo,
      );
    } catch (erro) {
      // NÃO reporta ao Sentry: um POST forjado é ruído esperado numa rota pública.
      this.logger.warn(
        `Evento recusado (assinatura inválida): ${this.msg(erro)}`,
      );
      throw new BadRequestException('Assinatura inválida.');
    }
  }

  // Processa o evento já verificado. Devolve o que fez (para log/teste).
  async processar(
    evento: Stripe.Event,
    now: Date = new Date(),
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    // Idempotência: a PK é o id do evento. Se a inserção não pegou, já tratamos
    // este evento antes — sai sem fazer nada. Grava ANTES de aplicar: reentrega
    // durante o processamento não duplica efeito.
    const inserido = await this.eventos
      .createQueryBuilder()
      .insert()
      .values({
        id: evento.id,
        tipo: evento.type,
        criadoEmStripe: new Date(evento.created * 1000),
      })
      .orIgnore()
      .execute();
    if ((inserido.raw as unknown[]).length === 0) {
      return { aplicado: false, motivo: 'evento repetido' };
    }

    try {
      return await this.aplicar(evento, now);
    } catch (erro) {
      // Erro aqui é grave: um pagamento pode não ter sido registrado. Vai para o
      // Sentry (T-106) — e devolvemos 500 para a Stripe REENTREGAR o evento.
      capturarErro(erro, 'stripe.webhook', { tipo: evento.type });
      this.logger.error(`Falha ao aplicar ${evento.type}: ${this.msg(erro)}`);
      // O evento fica registrado como processado, mas o efeito não valeu. Remove
      // o registro para que a reentrega da Stripe possa tentar de novo.
      await this.eventos.delete({ id: evento.id });
      throw erro;
    }
  }

  private async aplicar(
    evento: Stripe.Event,
    now: Date,
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    switch (evento.type) {
      // O ciclo de vida da assinatura — é daqui que sai o status.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return this.aplicarSubscription(
          evento.data.object,
          new Date(evento.created * 1000),
          now,
        );

      // Reembolso (T-157). A Stripe NÃO cancela a assinatura ao reembolsar: sem
      // tratar isto, a pessoa fica com o dinheiro de volta E com o acesso.
      //
      // O carimbo é o relógio da STRIPE, nunca o `now` local: o `aplicarPagamento`
      // compara esta marca com o `created` do `invoice.paid` (também da Stripe), e
      // misturar os dois relógios bloquearia quem pagou. Ver `aplicarReembolso`.
      case 'charge.refunded':
        return this.aplicarReembolso(
          evento.data.object,
          new Date(evento.created * 1000),
        );

      // Pagamento confirmado (T-157): o status em si já vem pelo
      // `customer.subscription.updated` que a Stripe emite junto — o que importa
      // aqui é destravar quem foi reembolsado e voltou a pagar.
      case 'invoice.paid':
        return this.aplicarPagamento(
          evento.data.object,
          new Date(evento.created * 1000),
        );

      // A própria Stripe emite um `customer.subscription.updated` junto, então
      // aqui só logamos — tratar os dois duplicaria a escrita sem acrescentar
      // informação.
      case 'invoice.payment_failed':
      case 'checkout.session.completed':
        return {
          aplicado: false,
          motivo: `${evento.type} (sem efeito próprio)`,
        };

      default:
        return { aplicado: false, motivo: 'tipo ignorado' };
    }
  }

  private async aplicarSubscription(
    sub: Stripe.Subscription,
    criadoEmStripe: Date,
    now: Date,
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    const estado = estadoDaAssinatura(sub, now);
    if (!estado) {
      // `incomplete`: a 1ª cobrança ainda não foi paga. Não mexe — o trial local
      // pode estar valendo, e derrubá-lo seria punir quem só começou a digitar
      // o cartão.
      return {
        aplicado: false,
        motivo: `status ${sub.status} não muda o estado`,
      };
    }

    const assinatura = await this.acharAssinatura(sub);
    if (!assinatura) {
      // Sem dono não há o que atualizar. É bug nosso (o Checkout carimba o
      // userId) — precisa aparecer no Sentry, não morrer no log.
      capturarErro(
        new Error(`Assinatura da Stripe sem dono local: ${sub.id}`),
        'stripe.webhook.semDono',
        { subscriptionId: sub.id },
      );
      return { aplicado: false, motivo: 'assinatura local não encontrada' };
    }

    // FORA DE ORDEM: evento mais VELHO que o último aplicado não vale. Sem esta
    // guarda, um `updated` atrasado ressuscitaria um estado vencido.
    if (
      assinatura.stripeAtualizadoEm &&
      criadoEmStripe.getTime() < assinatura.stripeAtualizadoEm.getTime()
    ) {
      return {
        aplicado: false,
        motivo: 'evento mais velho que o estado atual',
      };
    }

    // O patch (incluindo a regra do pastDueDesde) é compartilhado com a
    // reconciliação (T-143). Aqui só somamos o `stripeAtualizadoEm`, que é a
    // guarda de ordem específica do webhook.
    await this.assinaturas.update(
      { id: assinatura.id },
      {
        ...montarPatch(assinatura, estado, this.customerId(sub)),
        stripeAtualizadoEm: criadoEmStripe,
      },
    );
    this.logger.log(
      `Assinatura de ${assinatura.userId}: ${assinatura.status} → ${estado.status}` +
        ` (cancelAtPeriodEnd=${estado.cancelAtPeriodEnd}, fimPeriodo=${
          estado.currentPeriodEnd?.toISOString() ?? 'null'
        }).`,
    );
    return { aplicado: true };
  }

  /**
   * Reembolso (T-157): o dinheiro voltou, o acesso vai junto.
   *
   * A Stripe NÃO cancela a assinatura ao reembolsar — ela continua `active`. Sem
   * isto, a pessoa fica com o dinheiro E com o produto. E marcar `canceled` no
   * nosso banco não resolveria: a reconciliação (T-143) releria `active` da
   * Stripe e desfaria. Por isso o fato mora numa coluna própria, fora do
   * `montarPatch`.
   *
   * Só o reembolso INTEGRAL corta. Parcial (cortesia, ajuste, pro-rata) é outra
   * conversa: tirar o produto de quem recebeu R$ 20 de volta seria absurdo.
   *
   * `criadoEmStripe` é o instante do EVENTO na Stripe, não o nosso `now`. A marca
   * é lida de volta pelo `aplicarPagamento`, que a compara com o `created` do
   * `invoice.paid` — os dois lados PRECISAM sair do mesmo relógio. Com o `now`
   * local, um reembolso processado tarde (o free tier hiberna, §8) era carimbado
   * à frente de um pagamento posterior a ele, e o `invoice.paid` era descartado
   * como "anterior ao reembolso": o cliente pagava e continuava bloqueado, sem
   * conserto pela reconciliação (esta coluna fica fora do `montarPatch`).
   */
  private async aplicarReembolso(
    charge: Stripe.Charge,
    criadoEmStripe: Date,
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    if (charge.amount <= 0 || charge.amount_refunded < charge.amount) {
      return { aplicado: false, motivo: 'reembolso parcial: acesso mantido' };
    }
    const customerId =
      typeof charge.customer === 'string'
        ? charge.customer
        : (charge.customer?.id ?? null);
    if (!customerId) {
      return { aplicado: false, motivo: 'reembolso sem cliente' };
    }

    const assinatura = await this.assinaturas.findOne({
      where: { stripeCustomerId: customerId },
    });
    if (!assinatura) {
      // Cobrança reembolsada sem assinatura nossa: é bug ou cobrança avulsa.
      // Precisa aparecer no Sentry, não morrer no log.
      capturarErro(
        new Error(`Reembolso sem assinatura local: charge ${charge.id}`),
        'stripe.webhook.reembolsoSemDono',
        { chargeId: charge.id },
      );
      return { aplicado: false, motivo: 'assinatura local não encontrada' };
    }
    if (assinatura.reembolsadaEm) {
      return { aplicado: false, motivo: 'já reembolsada' };
    }

    // Sem guarda de ordem: marcar é idempotente, e o `montarPatch` não toca
    // nesta coluna — um `subscription.updated` atrasado não a apaga.
    await this.assinaturas.update(
      { id: assinatura.id },
      { reembolsadaEm: criadoEmStripe },
    );
    this.logger.log(
      `Assinatura de ${assinatura.userId} REEMBOLSADA (charge ${charge.id}): acesso cortado.`,
    );
    return { aplicado: true };
  }

  /**
   * Pagamento confirmado — usado para DESTRAVAR quem foi reembolsado e voltou.
   *
   * Sem isto, quem fosse reembolsado e assinasse de novo (ou cuja assinatura
   * apenas renovasse, já que reembolsar não cancela) pagaria e continuaria
   * bloqueado pela marca.
   *
   * A comparação é por DATA, não pela existência do pagamento: o `invoice.paid`
   * da fatura que FOI reembolsada é anterior ao reembolso e não pode limpar nada
   * — e os eventos da Stripe chegam fora de ordem (T-129).
   */
  private async aplicarPagamento(
    invoice: Stripe.Invoice,
    criadoEmStripe: Date,
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : (invoice.customer?.id ?? null);
    if (!customerId) return { aplicado: false, motivo: 'fatura sem cliente' };

    const assinatura = await this.assinaturas.findOne({
      where: { stripeCustomerId: customerId },
    });
    if (!assinatura?.reembolsadaEm) {
      return { aplicado: false, motivo: 'invoice.paid (sem efeito próprio)' };
    }
    if (criadoEmStripe.getTime() <= assinatura.reembolsadaEm.getTime()) {
      return { aplicado: false, motivo: 'pagamento anterior ao reembolso' };
    }

    await this.assinaturas.update(
      { id: assinatura.id },
      { reembolsadaEm: null },
    );
    this.logger.log(
      `Assinatura de ${assinatura.userId}: pagamento novo após reembolso — acesso liberado.`,
    );
    return { aplicado: true };
  }

  // Acha o dono: pelo `userId` que o Checkout carimbou (T-128) e, se faltar,
  // pelos ids da Stripe já gravados. NUNCA pelo e-mail — a pessoa pode trocá-lo
  // dentro do próprio Checkout.
  private async acharAssinatura(
    sub: Stripe.Subscription,
  ): Promise<Assinatura | null> {
    const userId = userIdDaSubscription(sub);
    if (userId) {
      const porUser = await this.assinaturas.findOne({ where: { userId } });
      if (porUser) return porUser;
    }
    const porSub = await this.assinaturas.findOne({
      where: { stripeSubscriptionId: sub.id },
    });
    if (porSub) return porSub;

    const customerId = this.customerId(sub);
    if (!customerId) return null;
    return this.assinaturas.findOne({
      where: { stripeCustomerId: customerId },
    });
  }

  private customerId(sub: Stripe.Subscription): string | null {
    return typeof sub.customer === 'string'
      ? sub.customer
      : (sub.customer?.id ?? null);
  }

  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
