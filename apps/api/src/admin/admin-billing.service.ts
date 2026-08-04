import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { fimDaCarencia } from '../assinaturas/acesso';
import {
  AsaasBillingService,
  CobrancaAsaas,
} from '../assinaturas/asaas-billing.service';
import { AsaasEvent } from '../assinaturas/asaas-event.entity';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../assinaturas/assinatura-status.enum';

import { User } from '../users/user.entity';

const PAGE_SIZE = 20;

export interface AssinaturaRow {
  userId: string;
  email: string;
  status: string;
  plano: string;
  /** QUEM cobra esta conta hoje. `null` = trial (ninguém ainda). */
  provider: 'stripe' | 'asaas' | null;
  stripeCustomerId: string | null;
  asaasCustomerId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  cortesiaAte: Date | null;
  suspensoEm: Date | null;
  /** Desde quando o pagamento falha. Null = não está inadimplente. */
  pastDueDesde: Date | null;
  /**
   * Quando o acesso cai se ninguém pagar (T-220/item D).
   *
   * ⚠️ Sai de `fimDaCarencia`, a MESMA função que o `calcularAcesso` usa para
   * barrar (§3.3). Recalcular aqui faria o painel mostrar uma data e o paywall
   * cortar noutra — e o painel é onde o dono decide se estende ou não.
   */
  carenciaAte: Date | null;
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
  /** Instante no PROVEDOR. Nullable: o Asaas não carimba todo evento. */
  criadoEmProvedor: Date | null;
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
    @InjectRepository(AsaasEvent)
    private readonly eventosAsaas: Repository<AsaasEvent>,
    private readonly asaas: AsaasBillingService,
  ) {}

  private readonly logger = new Logger(AdminBillingService.name);

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
        provider: a.provider,
        stripeCustomerId: a.stripeCustomerId,
        asaasCustomerId: a.asaasCustomerId,
        currentPeriodEnd: a.currentPeriodEnd,
        cancelAtPeriodEnd: a.cancelAtPeriodEnd,
        trialEndsAt: a.trialEndsAt,
        cortesiaAte: a.cortesiaAte,
        suspensoEm: a.suspensoEm,
        pastDueDesde: a.pastDueDesde,
        carenciaAte: fimDaCarencia(a.pastDueDesde ?? null),
      })),
      total,
      page: opts.page,
      pageSize: PAGE_SIZE,
    };
  }

  /**
   * MRR: ativos mensais × preço mensal + ativos anuais × (preço anual / 12).
   *
   * ⚠️ Voltou a ser SIMPLES no corte (T-224). A T-221 o quebrara por provedor
   * porque Stripe e Asaas tinham fontes de preço diferentes, e multiplicar a
   * base inteira por um preço só fazia metade do número sair errado. Com um
   * provedor, aquela complexidade deixou de pagar por si.
   *
   * ⚠️ Contamos ASSINATURAS, não ids de provedor — e isso importa mesmo agora:
   * conta migrada tem `stripe_subscription_id` guardado como HISTÓRICO, e contar
   * por presença de id a duplicaria. Há teste travando.
   *
   * ⚠️ `null` (e não zero) quando o preço não está configurado: zero é um fato,
   * `null` é "não sei", e a tela mostra coisas diferentes.
   */
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
      const precos = await this.asaas.listarPrecos();
      return {
        mrrCentavos:
          ativosMensal * precos.mensal.valor +
          ativosAnual * Math.round(precos.anual.valor / 12),
        moeda: precos.mensal.moeda,
        ativosMensal,
        ativosAnual,
      };
    } catch (e) {
      this.logger.warn(
        `MRR sem preço: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * Webhooks processados.
   *
   * 🔴 Importa mais do que parece: a fila do Asaas **para sozinha** após falhas
   * seguidas (`interrupted`, medido na T-209), e esta lista é onde se desconfia
   * disso a olho. O alerta ativo da T-223 é a proteção; isto é a conferência.
   *
   * 📌 Lia os dois provedores até a T-224. A tabela `stripe_events` FICA no
   * banco como histórico, mas não é mais lida — não nascem eventos novos lá.
   */
  async webhooks(page: number): Promise<WebhooksPagina> {
    const [data, total] = await this.eventosAsaas.findAndCount({
      order: { processadoEm: 'DESC' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return {
      data: data.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        // Nullable de propósito: o Asaas não carimba todo evento, e recusá-lo
        // seria perder uma cobrança confirmada (T-211).
        criadoEmProvedor: e.criadoEmAsaas,
        processadoEm: e.processadoEm,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /**
   * Cobranças de uma conta — leitura, para o dono resolver sem sair do painel.
   *
   * ⚠️ É o substituto honesto do "reenviar cobrança" que o backlog pedia: **não
   * existe reenvio no Asaas**. O que resolve de verdade é o `pagarUrl` da
   * cobrança em aberto, que o dono copia e manda para o cliente que perdeu o
   * boleto de vista.
   *
   * ⚠️ Só Asaas. Conta da Stripe tem faturas no painel dela, e duplicar aquilo
   * aqui seria construir um segundo lugar para a mesma verdade.
   */
  async cobrancasDaConta(userId: string): Promise<CobrancaAsaas[]> {
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (assinatura?.provider !== 'asaas') return [];
    const portal = await this.asaas.detalhesPortal(userId);
    return portal.cobrancas;
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
