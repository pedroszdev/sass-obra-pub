import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigStoreService } from '../config/config-store.service';
import { User } from '../users/user.entity';
import { AsaasClient } from './asaas-client';
import { ASAAS_CLIENT } from './asaas.provider';
import { dataAsaas } from './asaas-webhook.service';
import { Assinatura } from './assinatura.entity';
import { Plano } from './precos';

// Cobrança pelo Asaas (Épico 17): cliente (T-212) e conversão do trial (T-213).
// O webhook, que é quem LIBERA o acesso, é a T-214.
//
// ⚠️ Convive com o `StripeBillingService` de propósito: até o corte (T-224) quem
// cobra em produção é a Stripe. Nada aqui é chamado por controller ainda.
//
// ⚠️ O TRIAL NÃO PASSA POR AQUI, e isso é intencional: ele nasce no nosso banco
// no cadastro (T-127) e a decisão é a função pura `calcularAcesso`. **Nenhum
// objeto é criado no provedor enquanto a pessoa só experimenta** — nem na
// Stripe era. Conversão é o primeiro momento em que o Asaas fica sabendo que
// esta conta existe.

/**
 * Centavos → reais, a ÚNICA fronteira onde a unidade muda (T-213).
 *
 * 🔴 O resto do projeto fala CENTAVOS (herança da Stripe, cuja API é em
 * centavos). O Asaas fala REAIS com decimais: `value: 100` é R$ 100,00, não
 * R$ 1,00. Mandar centavos direto cobra **100 vezes** o preço.
 *
 * Fica aqui, exportada e testada, exatamente para não haver uma segunda
 * conversão espalhada — que é como o erro voltaria depois de corrigido.
 */
export function centavosParaReais(centavos: number): number {
  // Duas casas: o Asaas recusa mais que isso, e ponto flutuante em dinheiro
  // pede arredondamento explícito (0.1 + 0.2 !== 0.3).
  return Math.round(centavos) / 100;
}

/**
 * Reais → centavos, a volta do caminho de `centavosParaReais` (T-216).
 *
 * ⚠️ Existe porque a leitura também cruza a fronteira: o Asaas **devolve** reais
 * (`value: 100` = R$ 100,00) e o resto do projeto — tela, formatação, `/admin` —
 * fala centavos. Sem esta função, o valor voltaria 100× menor na tela do
 * cliente, que é o mesmo erro da ida, só que silencioso (ninguém reclama de ver
 * um preço baixo demais até a fatura chegar).
 *
 * `Math.round` porque `1.1 * 100 === 110.00000000000001` em ponto flutuante.
 */
export function reaisParaCentavos(reais: number): number {
  return Math.round(reais * 100);
}

/** Ciclo do Asaas para cada plano nosso. */
const CICLO_ASAAS: Record<Plano, 'MONTHLY' | 'YEARLY'> = {
  mensal: 'MONTHLY',
  anual: 'YEARLY',
};

/** O checkout hospedado expira; 60 min é folga suficiente para pagar com calma. */
const CHECKOUT_MINUTOS = 60;

/** Data de hoje em `YYYY-MM-DD`, que é o formato que o Asaas espera. */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Quantas cobranças a tela lista. Histórico completo não é caso de uso aqui. */
const COBRANCAS_LIMITE = 12;

/** Uma cobrança como o portal (T-216) precisa vê-la. Valor em CENTAVOS. */
export interface CobrancaAsaas {
  id?: string;
  valor: number;
  vencimento: Date | null;
  /** Status CRU do Asaas (`PENDING`, `RECEIVED`...) — quem rotula é a tela. */
  status: string;
  /** `BOLETO`, `PIX`, `CREDIT_CARD`, `UNDEFINED`… */
  meio: string | null;
  /** Página HOSPEDADA de pagamento (boleto e Pix). Null = nada a pagar. */
  pagarUrl: string | null;
  boletoUrl: string | null;
  comprovanteUrl: string | null;
}

export interface PortalAsaas {
  cobrancas: CobrancaAsaas[];
  /**
   * Se existe portal HOSPEDADO pelo provedor. **Sempre `false` no Asaas** — e é
   * por isso que o campo existe: o front precisa escolher entre "abrir o portal
   * do provedor" (Stripe) e "renderizar a nossa tela" (Asaas) sem adivinhar.
   */
  temGestaoExterna: boolean;
}

/** A assinatura no Asaas, no que a troca de plano precisa ler de volta. */
interface AsaasSubscriptionResumo {
  id?: string;
  value?: number;
  cycle?: string;
  nextDueDate?: string;
}

/** A cobrança no Asaas, nos campos que usamos. */
interface AsaasPayment {
  id?: string;
  value?: number;
  dueDate?: string;
  status?: string;
  billingType?: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
}

/** O cliente no Asaas, nos campos que usamos. */
interface AsaasCustomer {
  id: string;
  name?: string;
  email?: string;
  cpfCnpj?: string | null;
  externalReference?: string | null;
}

interface ListaAsaas<T> {
  data?: T[];
  totalCount?: number;
}

@Injectable()
export class AsaasBillingService {
  private readonly logger = new Logger(AsaasBillingService.name);

  constructor(
    @Inject(ASAAS_CLIENT)
    private readonly asaas: AsaasClient | null,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly configStore: ConfigStoreService,
    private readonly config: ConfigService,
  ) {}

  private cliente(): AsaasClient {
    if (!this.asaas) {
      throw new ServiceUnavailableException(
        'Cobrança indisponível: ASAAS_API_KEY não configurada.',
      );
    }
    return this.asaas;
  }

  /**
   * Garante que existe um cliente no Asaas para este usuário e devolve o id.
   *
   * `exigirDocumento` = está prestes a COBRAR. Medido na T-209: o Asaas cria
   * cliente **sem** CPF/CNPJ numa boa (200, `cpfCnpj: null`), mas recusa
   * `/payments` e `/subscriptions` com 400 `Para criar esta cobrança é
   * necessário preencher o CPF ou CNPJ do cliente`. Ou seja, **a falha por falta
   * de documento acontece TARDE**, e a mensagem crua do provedor não ajuda o
   * usuário. Barramos antes, com texto que diz o que fazer.
   */
  async garantirCustomer(
    userId: string,
    { exigirDocumento = false }: { exigirDocumento?: boolean } = {},
  ): Promise<string> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (exigirDocumento && !user.cnpj) {
      // Contas legadas e as criadas pelo Google antes da T-225 caem aqui.
      throw new BadRequestException(
        'Informe o CNPJ da empresa antes de assinar — ele é obrigatório na nota fiscal.',
      );
    }

    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura) {
      throw new NotFoundException('Assinatura não encontrada');
    }
    if (assinatura.asaasCustomerId) {
      await this.sincronizarDocumento(assinatura.asaasCustomerId, user);
      return assinatura.asaasCustomerId;
    }

    const existente = await this.buscarPorReferencia(userId);
    const customerId = existente
      ? existente.id
      : await this.criarCustomer(user, userId);

    if (existente) {
      // Chegar aqui significa que uma tentativa anterior criou o cliente e
      // morreu antes de gravar o id. Sem esta busca, a retentativa criaria um
      // SEGUNDO cliente para a mesma pessoa — e o Asaas não tem chave de
      // idempotência como a Stripe (é por isso que a busca existe).
      this.logger.warn(
        `Cliente Asaas órfão adotado para o usuário ${userId}: ${customerId}`,
      );
      await this.sincronizarDocumento(customerId, user);
    }

    await this.assinaturas.update(
      { id: assinatura.id },
      { asaasCustomerId: customerId },
    );
    // ⚠️ `provider` NÃO é escrito aqui: cliente não é cobrança. Quem passa a
    // cobrar só se decide quando a ASSINATURA existe (T-213) — marcar antes
    // faria o /admin e a reconciliação acharem que a conta migrou.
    return customerId;
  }

  /**
   * Converte o trial em assinatura paga — CARTÃO, pelo checkout hospedado.
   *
   * ⚠️ Cartão é o ÚNICO meio aceito em recorrência no checkout do Asaas. A API é
   * literal (medido T-209): "O método de pagamento CREDIT_CARD é o único método
   * de pagamento permitido para operações RECURRENT". Boleto e Pix vão pelo
   * outro caminho (`criarAssinaturaDireta`).
   *
   * ⚠️ NADA aqui marca a assinatura como paga. Quem marca é o webhook (T-214),
   * pela mesma razão da Stripe (§8): o retorno do navegador não prova pagamento
   * — o usuário pode digitar a `successUrl` na barra de endereço.
   */
  async criarCheckout(userId: string, plano: Plano): Promise<{ url: string }> {
    const precoCentavos = await this.precoDoPlano(plano);
    // `exigirDocumento`: daqui a pouco vai existir cobrança, e sem CPF/CNPJ o
    // Asaas recusa com uma mensagem crua (T-209). Barramos antes.
    await this.garantirCustomer(userId, { exigirDocumento: true });

    const criado = await this.cliente().post<{ id: string; link?: string }>(
      '/checkouts',
      {
        billingTypes: ['CREDIT_CARD'],
        chargeTypes: ['RECURRENT'],
        minutesToExpire: CHECKOUT_MINUTOS,
        externalReference: userId,
        callback: {
          successUrl: `${this.webOrigin}/assinatura?status=sucesso`,
          cancelUrl: `${this.webOrigin}/assinatura?status=cancelado`,
          expiredUrl: `${this.webOrigin}/assinatura?status=expirado`,
        },
        items: [
          {
            name: `PrumoLicita ${plano}`,
            quantity: 1,
            value: centavosParaReais(precoCentavos),
          },
        ],
        subscription: {
          cycle: CICLO_ASAAS[plano],
          nextDueDate: hojeISO(),
          // ⚠️ SEM `endDate` de propósito: assinatura de SaaS não acaba. O
          // exemplo da doc traz um, e copiá-lo poria data de morte na cobrança
          // (medido na T-209: o campo é opcional).
        },
      },
    );

    if (!criado.link) {
      throw new ServiceUnavailableException(
        'O Asaas não devolveu o link do checkout.',
      );
    }
    return { url: criado.link };
  }

  /**
   * Converte o trial — BOLETO ou PIX, por assinatura direta.
   *
   * `billingType: UNDEFINED` é a descoberta que simplificou a T-208: em vez de
   * um fluxo para boleto e outro para Pix, **o pagador escolhe o meio a cada
   * cobrança** (medido T-209, assinatura criada `ACTIVE`).
   *
   * ⚠️ Isto NÃO é cobrança automática: cada ciclo gera uma cobrança que alguém
   * precisa pagar. É por isso que a régua de inadimplência (T-220) cresce — e
   * ela deve ser escrita para "cobrança manual", não para "boleto", senão
   * nasce com o nome errado.
   */
  async criarAssinaturaDireta(
    userId: string,
    plano: Plano,
  ): Promise<{ assinaturaId: string }> {
    const precoCentavos = await this.precoDoPlano(plano);
    const customerId = await this.garantirCustomer(userId, {
      exigirDocumento: true,
    });

    const criada = await this.cliente().post<{ id: string; status?: string }>(
      '/subscriptions',
      {
        customer: customerId,
        billingType: 'UNDEFINED',
        value: centavosParaReais(precoCentavos),
        nextDueDate: hojeISO(),
        cycle: CICLO_ASAAS[plano],
        description: `PrumoLicita — plano ${plano}`,
        // Mesmo papel do `metadata.userId` da Stripe: o webhook acha o dono sem
        // depender do e-mail, que a pessoa troca no meio do caminho.
        externalReference: userId,
      },
    );

    // O id é gravado IMEDIATAMENTE: entre criar lá e gravar aqui existe uma
    // janela em que a assinatura seria órfã, e o Asaas não tem idempotência
    // para desfazer isso (T-212). Gravar antes de qualquer outra coisa encurta
    // a janela ao mínimo.
    await this.assinaturas.update(
      { userId },
      { asaasSubscriptionId: criada.id, provider: 'asaas' },
    );
    // ⚠️ `provider` é escrito AQUI, não na criação do cliente: é neste ponto que
    // a cobrança passa a existir do outro lado. E o STATUS continua intocado —
    // quem libera acesso é o webhook (T-214).
    return { assinaturaId: criada.id };
  }

  /**
   * Dados do portal do assinante (T-216) — o que a tela precisa mostrar.
   *
   * 🔴 **Este método existe porque o Asaas NÃO TEM portal hospedado** (medido na
   * T-207). Onde a Stripe entregava um Customer Portal pronto, aqui a tela é
   * nossa. O que NÃO muda é a regra de PCI: **nada de cartão passa por aqui** —
   * as ações de pagamento saem por URL hospedada do provedor.
   *
   * ⚠️ `invoiceUrl` é a peça que evita a tela cara: é a **página de pagamento
   * hospedada** do Asaas, e serve a boleto E Pix (inclusive quando o
   * `billingType` é `UNDEFINED` e o pagador escolhe na hora). Renderizar linha
   * digitável e QR de Pix por conta própria seria mais código, mais superfície e
   * nenhum ganho.
   */
  async detalhesPortal(userId: string): Promise<PortalAsaas> {
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura) {
      throw new NotFoundException('Assinatura não encontrada');
    }
    const subId = assinatura.asaasSubscriptionId;
    if (!subId) {
      // Trial ou conta que nunca converteu: não há cobrança nenhuma do outro
      // lado, e isso é estado normal — não é erro.
      return { cobrancas: [], temGestaoExterna: false };
    }

    let cobrancas: CobrancaAsaas[] = [];
    try {
      const lista = await this.cliente().get<ListaAsaas<AsaasPayment>>(
        `/subscriptions/${subId}/payments?limit=${COBRANCAS_LIMITE}`,
      );
      cobrancas = (lista.data ?? []).map((p) => this.mapearCobranca(p));
    } catch (erro) {
      // A tela precisa abrir mesmo com o provedor instável: sem isto, uma
      // indisponibilidade do Asaas deixaria o assinante sem ver o próprio plano.
      this.logger.error(
        `Falha ao listar cobranças de ${subId}: ${this.msg(erro)}`,
      );
    }
    return { cobrancas, temGestaoExterna: false };
  }

  /**
   * Troca o plano (mensal ↔ anual) — **na virada do ciclo, sem proporcional**.
   * Decisão do dono, 30/07/2026.
   *
   * ── Por que sem rateio ──
   *
   * 1. **Mensal e anual não diferem em FUNCIONALIDADE**, só em preço e ciclo.
   *    Não existe "upgrade" a apressar: ninguém ganha acesso a nada ao trocar, e
   *    o desconto do anual começa quando a cobrança anual começa.
   * 2. **O Asaas não faz rateio** (a Stripe fazia). Proporcional aqui seria
   *    matemática de dinheiro em código nosso — a fonte clássica de erro de
   *    cobrança, e sem backup com restore testado.
   * 3. **O downgrade não teria solução limpa:** quem pagou o ano teria crédito a
   *    receber, e o Asaas não tem conceito de saldo. Na virada, o problema não
   *    existe.
   *
   * ⚠️ `updatePendingPayments: false` é o coração disto, e foi MEDIDO no sandbox:
   * troquei uma assinatura de R$100/mês para R$1499/ano e a cobrança **já
   * gerada** continuou em R$100, com o `nextDueDate` intacto. Passar `true` aqui
   * reescreveria uma cobrança que o cliente talvez já tenha pago ou esteja
   * pagando — inclusive um boleto já impresso.
   */
  async trocarPlano(
    userId: string,
    plano: Plano,
  ): Promise<{ plano: Plano; valeAPartirDe: Date | null }> {
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura) {
      throw new NotFoundException('Assinatura não encontrada');
    }
    if (!assinatura.asaasSubscriptionId) {
      // Sem assinatura no provedor não há o que trocar: quem está em trial
      // simplesmente escolhe o plano na conversão (T-213).
      throw new BadRequestException(
        'Você ainda não tem uma assinatura ativa. Escolha o plano ao assinar.',
      );
    }

    const valorCentavos = await this.precoDoPlano(plano);
    const atualizada = await this.cliente().post<AsaasSubscriptionResumo>(
      `/subscriptions/${assinatura.asaasSubscriptionId}`,
      {
        value: centavosParaReais(valorCentavos),
        cycle: CICLO_ASAAS[plano],
        // ⚠️ NÃO mude para `true` — ver o comentário acima.
        updatePendingPayments: false,
      },
    );

    // O plano local passa a refletir o que SERÁ cobrado. A tela precisa dizer a
    // data junto, senão "plano anual" mente sobre a cobrança em aberto, que
    // continua no valor antigo.
    await this.assinaturas.update({ id: assinatura.id }, { plano });
    return { plano, valeAPartirDe: dataAsaas(atualizada.nextDueDate) };
  }

  private mapearCobranca(p: AsaasPayment): CobrancaAsaas {
    return {
      id: p.id,
      // ⚠️ Centavos: o Asaas devolve reais e o resto do projeto fala centavos.
      valor: reaisParaCentavos(p.value ?? 0),
      vencimento: dataAsaas(p.dueDate),
      status: p.status ?? 'DESCONHECIDO',
      meio: p.billingType ?? null,
      // Página hospedada de pagamento — serve boleto e Pix.
      pagarUrl: p.invoiceUrl ?? null,
      // PDF do boleto, quando existe.
      boletoUrl: p.bankSlipUrl ?? null,
      // ⚠️ NÃO é NFS-e. A nota é a T-219, e rotular isto de "nota fiscal"
      // prometeria um documento fiscal que o cliente não recebe aqui — o mesmo
      // cuidado que o `reciboUrl` da Stripe já tem (§8).
      comprovanteUrl: p.transactionReceiptUrl ?? null,
    };
  }

  /** Preço vigente do plano, em centavos. Sem preço configurado → 503. */
  private async precoDoPlano(plano: Plano): Promise<number> {
    const precos = await this.configStore.getPrecos();
    if (!precos) {
      // Falha FECHADO: sem preço configurado não se inventa um valor. O dono
      // define em /admin → Config (T-213 revogou a leitura do catálogo, §8).
      throw new ServiceUnavailableException(
        'Cobrança indisponível: preço da assinatura não configurado.',
      );
    }
    return plano === 'anual' ? precos.anualCentavos : precos.mensalCentavos;
  }

  private get webOrigin(): string {
    return (
      this.config.get<string>('WEB_ORIGIN')?.trim().replace(/\/$/, '') ||
      'http://localhost:5173'
    );
  }

  private async criarCustomer(user: User, userId: string): Promise<string> {
    const criado = await this.cliente().post<AsaasCustomer>('/customers', {
      name: user.name,
      email: user.email,
      // Vai quando existe. O Asaas aceita sem — a barreira real é a cobrança.
      cpfCnpj: user.cnpj ?? undefined,
      // O `userId` acompanha o cliente, como o `metadata` da Stripe: o webhook
      // acha o dono sem depender do e-mail, que a pessoa troca no checkout.
      externalReference: userId,
    });
    return criado.id;
  }

  /** Recupera cliente criado por uma tentativa que morreu antes de gravar o id. */
  private async buscarPorReferencia(
    userId: string,
  ): Promise<AsaasCustomer | null> {
    const lista = await this.cliente().get<ListaAsaas<AsaasCustomer>>(
      `/customers?externalReference=${encodeURIComponent(userId)}`,
    );
    return lista.data?.[0] ?? null;
  }

  /**
   * Preenche o CPF/CNPJ no Asaas quando ele existe aqui e lá não.
   *
   * ⚠️ NÃO sobrescreve documento divergente: trocar o CNPJ de um cliente é mudar
   * a identidade fiscal de quem já pode ter nota emitida (T-219). Diverge → log,
   * e alguém decide. É a mesma regra do `setCnpj` (T-225), que também só preenche.
   */
  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }

  private async sincronizarDocumento(
    customerId: string,
    user: User,
  ): Promise<void> {
    if (!user.cnpj) return;
    const atual = await this.cliente().get<AsaasCustomer>(
      `/customers/${customerId}`,
    );
    if (atual.cpfCnpj === user.cnpj) return;
    if (atual.cpfCnpj) {
      this.logger.error(
        `CNPJ divergente no Asaas para o cliente ${customerId}: lá "${atual.cpfCnpj}", aqui "${user.cnpj}". NÃO sobrescrito.`,
      );
      return;
    }
    await this.cliente().post<AsaasCustomer>(`/customers/${customerId}`, {
      cpfCnpj: user.cnpj,
    });
  }
}
