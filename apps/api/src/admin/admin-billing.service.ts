import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../assinaturas/assinatura-status.enum';
import { StripeBillingService } from '../assinaturas/stripe-billing.service';
import { StripeEvent } from '../assinaturas/stripe-event.entity';
import { User } from '../users/user.entity';

const PAGE_SIZE = 20;

export interface AssinaturaRow {
  userId: string;
  email: string;
  status: string;
  plano: string;
  stripeCustomerId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  cortesiaAte: Date | null;
  suspensoEm: Date | null;
}

export interface AssinaturasPagina {
  data: AssinaturaRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Mrr {
  mrrCentavos: number;
  moeda: string;
  ativosMensal: number;
  ativosAnual: number;
}

export interface WebhookEvento {
  id: string;
  tipo: string;
  criadoEmStripe: Date;
  processadoEm: Date;
}

export interface WebhooksPagina {
  data: WebhookEvento[];
  total: number;
  page: number;
  pageSize: number;
}

// Espelho de assinaturas + log de webhooks (T-192). Leitura; o "replay" (mutação)
// fica no controller via ReconciliacaoService. MRR é BEST-EFFORT — o preço vive
// na Stripe (§8), então se ela estiver fora, o MRR vem null.
@Injectable()
export class AdminBillingService {
  constructor(
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(StripeEvent)
    private readonly eventos: Repository<StripeEvent>,
    private readonly billing: StripeBillingService,
  ) {}

  async listar(opts: {
    status?: AssinaturaStatus;
    page: number;
  }): Promise<AssinaturasPagina> {
    const [linhas, total] = await this.assinaturas.findAndCount({
      where: opts.status ? { status: opts.status } : {},
      order: { createdAt: 'DESC' },
      skip: (opts.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    const emails = await this.emailsDe(linhas.map((a) => a.userId));
    return {
      data: linhas.map((a) => ({
        userId: a.userId,
        email: emails.get(a.userId) ?? '(desconhecido)',
        status: a.status,
        plano: a.plano,
        stripeCustomerId: a.stripeCustomerId,
        currentPeriodEnd: a.currentPeriodEnd,
        cancelAtPeriodEnd: a.cancelAtPeriodEnd,
        trialEndsAt: a.trialEndsAt,
        cortesiaAte: a.cortesiaAte,
        suspensoEm: a.suspensoEm,
      })),
      total,
      page: opts.page,
      pageSize: PAGE_SIZE,
    };
  }

  // MRR simples: ativos mensais × preço mensal + ativos anuais × (preço anual/12).
  // null se a Stripe/preço não estiver disponível (não trava a tela).
  async mrr(): Promise<Mrr | null> {
    const [ativosMensal, ativosAnual] = await Promise.all([
      this.assinaturas.count({
        where: { status: AssinaturaStatus.ACTIVE, plano: 'mensal' },
      }),
      this.assinaturas.count({
        where: { status: AssinaturaStatus.ACTIVE, plano: 'anual' },
      }),
    ]);
    try {
      const precos = await this.billing.listarPrecos();
      const mrrCentavos =
        ativosMensal * precos.mensal.valor +
        ativosAnual * Math.round(precos.anual.valor / 12);
      return {
        mrrCentavos,
        moeda: precos.mensal.moeda,
        ativosMensal,
        ativosAnual,
      };
    } catch {
      return null;
    }
  }

  async webhooks(page: number): Promise<WebhooksPagina> {
    const [data, total] = await this.eventos.findAndCount({
      order: { processadoEm: 'DESC' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return {
      data: data.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        criadoEmStripe: e.criadoEmStripe,
        processadoEm: e.processadoEm,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  private async emailsDe(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.users.find({
      where: { id: In(ids) },
      select: { id: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u.email]));
  }
}
