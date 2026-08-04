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
import { StripeBillingService } from '../assinaturas/stripe-billing.service';
import { StripeEvent } from '../assinaturas/stripe-event.entity';
import { User } from '../users/user.entity';

const PAGE_SIZE = 20;

export type ProviderBilling = 'stripe' | 'asaas';

export interface AssinaturaRow {
  userId: string;
  email: string;
  status: string;
  plano: string;
  /** QUEM cobra esta conta hoje. `null` = trial (ninguém ainda). */
  provider: ProviderBilling | null;
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

export interface MrrPorProvider {
  provider: ProviderBilling;
  mrrCentavos: number;
  ativosMensal: number;
  ativosAnual: number;
}

export interface Mrr {
  /** Soma dos providers que puderam ser calculados. */
  mrrCentavos: number;
  moeda: string;
  ativosMensal: number;
  ativosAnual: number;
  /** Quebra por provedor — o que o período de coexistência exige enxergar. */
  porProvider: MrrPorProvider[];
  /**
   * `true` quando ALGUM provedor não pôde ser calculado (preço indisponível).
   *
   * ⚠️ Existe para o número não mentir por omissão: sem esta flag, um MRR
   * faltando metade da base parece um MRR que caiu pela metade.
   */
  parcial: boolean;
}

export interface WebhookEvento {
  id: string;
  tipo: string;
  /** De qual provedor veio — hoje um evento do Asaas era invisível no painel. */
  origem: ProviderBilling;
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
    @InjectRepository(StripeEvent)
    private readonly eventos: Repository<StripeEvent>,
    @InjectRepository(AsaasEvent)
    private readonly eventosAsaas: Repository<AsaasEvent>,
    private readonly billing: StripeBillingService,
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
   * 🔴 **Por PROVEDOR, e isso não é enfeite de painel.** Os dois cobram preços
   * de fontes diferentes — o da Stripe vive no catálogo dela, o do Asaas no
   * nosso config store (T-213 revogou a regra do §8 para ele). Multiplicar a
   * base inteira por um preço só, como era antes, faz o MRR de metade dos
   * assinantes sair errado no período de coexistência.
   *
   * ⚠️ **Contagem dupla não vem da linha.** Contamos ASSINATURAS, e cada conta
   * tem uma só — mesmo migrada, com `stripe_subscription_id` guardado como
   * histórico e `asaas_subscription_id` ativo. Quem responde "quem cobra" é o
   * `provider` (o comentário da entidade diz isso, e vale aqui). Contar por
   * presença de id é que duplicaria; há teste travando isso.
   *
   * ⚠️ `provider` nulo conta como **stripe**: a migration da T-211 preencheu
   * `'stripe'` em toda assinatura que já existia, então nulo com status ativo é
   * remanescente daquela época, não conta nova (nova em trial não é ativa).
   *
   * ⚠️ Degrada por PARTE. Antes, a Stripe fora do ar zerava o MRR inteiro —
   * inclusive o do Asaas, que não depende dela. Agora o provedor que respondeu
   * entra na conta e a resposta vem marcada como `parcial`, para o número não
   * mentir por omissão.
   */
  async mrr(): Promise<Mrr | null> {
    const ativos = await this.assinaturas.find({
      where: { status: AssinaturaStatus.ACTIVE },
      select: { provider: true, plano: true },
    });
    if (ativos.length === 0) {
      return {
        mrrCentavos: 0,
        moeda: 'brl',
        ativosMensal: 0,
        ativosAnual: 0,
        porProvider: [],
        parcial: false,
      };
    }

    const contagem = new Map<
      ProviderBilling,
      { mensal: number; anual: number }
    >();
    for (const a of ativos) {
      const provider: ProviderBilling =
        a.provider === 'asaas' ? 'asaas' : 'stripe';
      const atual = contagem.get(provider) ?? { mensal: 0, anual: 0 };
      if (a.plano === 'anual') atual.anual++;
      else atual.mensal++;
      contagem.set(provider, atual);
    }

    const porProvider: MrrPorProvider[] = [];
    let parcial = false;
    let moeda = 'brl';
    for (const [provider, n] of contagem) {
      try {
        const precos =
          provider === 'asaas'
            ? await this.asaas.listarPrecos()
            : await this.billing.listarPrecos();
        moeda = precos.mensal.moeda;
        porProvider.push({
          provider,
          mrrCentavos:
            n.mensal * precos.mensal.valor +
            n.anual * Math.round(precos.anual.valor / 12),
          ativosMensal: n.mensal,
          ativosAnual: n.anual,
        });
      } catch (e) {
        // Sem preço deste provedor não se inventa um valor — some da conta e a
        // resposta avisa. Usar o preço do OUTRO seria um MRR plausível e falso.
        parcial = true;
        this.logger.warn(
          `MRR sem preço de ${provider}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Nenhum provedor respondeu: aí é o mesmo null de antes, e a tela mostra "—".
    if (porProvider.length === 0) return null;
    return {
      mrrCentavos: porProvider.reduce((t, p) => t + p.mrrCentavos, 0),
      moeda,
      ativosMensal: porProvider.reduce((t, p) => t + p.ativosMensal, 0),
      ativosAnual: porProvider.reduce((t, p) => t + p.ativosAnual, 0),
      porProvider,
      parcial,
    };
  }

  /**
   * Webhooks processados dos DOIS provedores, numa lista só.
   *
   * 🔴 Antes lia apenas `stripe_events` — um evento do Asaas era invisível no
   * painel. Isso importa mais do que parece: a fila do Asaas **para sozinha**
   * após falhas seguidas (`interrupted`, medido na T-209), e o painel era o
   * único lugar onde daria para desconfiar disso.
   *
   * ⚠️ Paginação sobre duas tabelas: busca `page × PAGE_SIZE` de cada uma,
   * intercala por data e corta a página. É correto para a página exibida e
   * simples; o custo é buscar a mais nas páginas fundas. Trocar por UNION em SQL
   * só compensa quando o volume justificar — e aí o `total` abaixo já é o real.
   */
  async webhooks(page: number): Promise<WebhooksPagina> {
    const take = page * PAGE_SIZE;
    const [stripe, totalStripe] = await this.eventos.findAndCount({
      order: { processadoEm: 'DESC' },
      take,
    });
    const [asaas, totalAsaas] = await this.eventosAsaas.findAndCount({
      order: { processadoEm: 'DESC' },
      take,
    });

    const todos: WebhookEvento[] = [
      ...stripe.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        origem: 'stripe' as const,
        criadoEmProvedor: e.criadoEmStripe,
        processadoEm: e.processadoEm,
      })),
      ...asaas.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        origem: 'asaas' as const,
        // Nullable de propósito: o Asaas não carimba todo evento, e recusar o
        // evento sem data seria perder uma cobrança confirmada (T-211).
        criadoEmProvedor: e.criadoEmAsaas,
        processadoEm: e.processadoEm,
      })),
    ].sort((a, b) => b.processadoEm.getTime() - a.processadoEm.getTime());

    return {
      data: todos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      total: totalStripe + totalAsaas,
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
