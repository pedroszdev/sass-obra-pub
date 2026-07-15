import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { Not, IsNull, Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { Assinatura } from './assinatura.entity';
import {
  customerIdDaSubscription,
  estadoDaAssinatura,
  montarPatch,
} from './stripe-mapper';
import { STRIPE_CLIENT } from './stripe.provider';

// Reconciliação com a Stripe (BACKLOG T-143). A REDE DE SEGURANÇA do webhook.
//
// O webhook (T-129) é entrega best-effort. No free tier do Render o serviço
// HIBERNA — uma janela de indisponibilidade nossa faz um evento se perder, e aí
// um cliente que PAGOU fica preso no paywall (T-130). É o pior bug do épico.
//
// Aqui relemos o estado ATUAL de cada assinatura na Stripe (que é a fonte da
// verdade do pagamento) e corrigimos o que divergir. Diferente do webhook, não há
// guarda de ordem: o `retrieve` traz o estado mais recente, sempre.
//
// Como todo @Cron no free tier, o agendado não é confiável — por isso existe o
// gatilho manual (POST /assinaturas/reconciliar, token de ops), igual à captação.

export interface ResultadoReconciliacao {
  verificadas: number;
  corrigidas: number;
}

@Injectable()
export class ReconciliacaoService {
  private readonly logger = new Logger(ReconciliacaoService.name);

  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe | null,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cronDiario(): Promise<void> {
    if (!this.stripe) return;
    await this.reconciliar().catch((e) => {
      capturarErro(e, 'reconciliacao.cron');
      this.logger.error(`Reconciliação (cron) falhou: ${this.msg(e)}`);
    });
  }

  async reconciliar(now: Date = new Date()): Promise<ResultadoReconciliacao> {
    if (!this.stripe) {
      return { verificadas: 0, corrigidas: 0 };
    }
    // Só quem já chegou a ter uma assinatura na Stripe. Trial local puro
    // (sem `stripeSubscriptionId`) não tem o que reconciliar.
    const comStripe = await this.assinaturas.find({
      where: { stripeSubscriptionId: Not(IsNull()) },
    });

    let corrigidas = 0;
    for (const assinatura of comStripe) {
      try {
        if (await this.reconciliarUma(assinatura, now)) corrigidas++;
      } catch (erro) {
        // Uma assinatura que falha (ex.: sumiu na Stripe) não derruba as demais.
        capturarErro(erro, 'reconciliacao.uma', {
          assinaturaId: assinatura.id,
        });
        this.logger.warn(
          `Reconciliação falhou para ${assinatura.userId}: ${this.msg(erro)}`,
        );
      }
    }
    if (corrigidas > 0) {
      this.logger.log(
        `Reconciliação: ${corrigidas}/${comStripe.length} assinatura(s) corrigida(s).`,
      );
    }
    return { verificadas: comStripe.length, corrigidas };
  }

  private async reconciliarUma(
    assinatura: Assinatura,
    now: Date,
  ): Promise<boolean> {
    const sub = await this.cliente().subscriptions.retrieve(
      assinatura.stripeSubscriptionId as string,
    );
    const estado = estadoDaAssinatura(sub, now);
    if (!estado) return false; // status incompleto: não mexe (igual ao webhook)

    // Nada divergiu → não escreve à toa. O `cancelAtPeriodEnd` PRECISA entrar
    // aqui: cancelar no Portal mantém `active` e o mesmo `currentPeriodEnd` — só
    // vira esta flag. Sem compará-la, a reconciliação (a rede de segurança para
    // quando o webhook se perde no free tier) nunca detectaria o cancelamento.
    if (
      assinatura.status === estado.status &&
      this.mesmaData(assinatura.currentPeriodEnd, estado.currentPeriodEnd) &&
      assinatura.cancelAtPeriodEnd === estado.cancelAtPeriodEnd
    ) {
      return false;
    }

    await this.assinaturas.update(
      { id: assinatura.id },
      montarPatch(assinatura, estado, customerIdDaSubscription(sub)),
    );
    this.logger.log(
      `Reconciliada ${assinatura.userId}: ${assinatura.status} → ${estado.status}.`,
    );
    return true;
  }

  private mesmaData(a: Date | null, b: Date | null): boolean {
    if (a === null || b === null) return a === b;
    return new Date(a).getTime() === new Date(b).getTime();
  }

  private cliente(): Stripe {
    if (!this.stripe) throw new Error('Stripe não configurada');
    return this.stripe;
  }

  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
