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
import { emailAssinaturaCancelada } from '../mail/mail.templates';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { AsaasClient, AsaasError } from './asaas-client';
import {
  CobrancaPendente,
  podeReescreverCobrancas,
  primeiroVencimentoEmAberto,
} from './asaas-cobrancas';
import { ASAAS_CLIENT } from './asaas.provider';
import { dataAsaas } from './asaas-webhook.service';
import { dataDaPrimeiraCobranca } from './acesso';
import { Assinatura } from './assinatura.entity';
import { AssinaturaStatus } from './assinatura-status.enum';
import { MotivoCancelamento } from './motivos-cancelamento';
import { PrecosResponse } from './stripe-billing.service';
import { compararPlanos, Plano, PrecoPlano } from './precos';

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

/** Data de hoje em `YYYY-MM-DD`, que é o formato que o Asaas espera. */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Um instante → `YYYY-MM-DD` **no calendário de Brasília**.
 *
 * ⚠️ Não use `toISOString().slice(0,10)` para isto: o servidor roda em UTC (§8),
 * e `2026-09-30T02:00:00Z` é dia **29** em Brasília. Um dia de erro aqui é um
 * dia de cobrança adiantada — ou de acesso sobreposto.
 */
function dataBrasiliaISO(d: Date): string {
  // `en-CA` formata como `YYYY-MM-DD`, que é exatamente o que o Asaas espera.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
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

/** Dado de cartão em TRÂNSITO. Nunca persistido, nunca logado. */
export interface DadosCartao {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface DadosTitular {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
}

/** O que o Asaas devolve depois da troca: mascarado, nunca o PAN. */
interface AsaasSubscriptionComCartao {
  id?: string;
  creditCard?: {
    creditCardNumber?: string;
    creditCardBrand?: string;
    creditCardToken?: string;
  };
}

/** A cobrança no Asaas, nos campos que usamos. */
export interface AsaasPayment {
  id?: string;
  value?: number;
  dueDate?: string;
  /** Quando o pagamento foi CONFIRMADO — é daqui que corre o prazo do CDC. */
  paymentDate?: string;
  status?: string;
  billingType?: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
  /** Assinatura de origem — é por ele que a lista da conta é agrupada. */
  subscription?: string;
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
    private readonly mail: MailService,
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
   * Converte o trial (ou REATIVA) — CARTÃO, por assinatura direta.
   *
   * 🔴 SUBSTITUI O CHECKOUT HOSPEDADO, que foi removido (decisão do dono,
   * 01/08). O checkout causou QUATRO problemas, todos da mesma raiz — **ele
   * criava cliente e assinatura por conta própria, e nós só ficávamos sabendo
   * depois**:
   *   1. **cliente fantasma** (dois clientes com o mesmo e-mail na conta Asaas);
   *   2. **assinatura duplicada** cobrando em paralelo, quando usado para
   *      trocar cartão — em modo recorrente o checkout CRIA, não edita;
   *   3. **documento errado na nota**: o cliente nascia com o CPF que o pagador
   *      digitasse, e a construtora precisa da NFS-e no CNPJ (T-219);
   *   4. **reativação que nunca confirmava**: a 1ª cobrança da reativação é
   *      agendada para o fim do período pago, então o `PAYMENT_CONFIRMED` que
   *      nos avisaria só viria meses depois — e a tela seguia dizendo
   *      "Cancelada" (bug real, visto pelo dono ao clicar Reativar).
   *
   * Criando nós mesmos, os quatro somem: o cliente é o NOSSO (com o CNPJ), a
   * assinatura é uma só, e o id volta na resposta — sabemos na hora.
   *
   * ⚠️ MEDIDO no sandbox (01/08) antes de escrever isto: o Asaas **valida o
   * cartão na criação, mesmo com vencimento futuro** — cartão expirado e recusa
   * do emissor voltam 400 na hora, e a cobrança nasce `PENDING` para a data
   * pedida. Ou seja, a pessoa descobre que o cartão não presta AGORA, não daqui
   * a um ano. ⚠️ Mas ele **NÃO** pega tudo: um número que falha no dígito
   * verificador (Luhn) foi aceito no teste. **A validação do formulário
   * (`lib/cartao.ts`) é carga, não enfeite.**
   *
   * INVARIANTES DE CARTÃO (as mesmas de `trocarCartao`, e valem igual aqui):
   * nada persistido, nada em log, nada na resposta além de últimos 4 + bandeira,
   * e `remoteIp` do CLIENTE (exigência antifraude).
   */
  async criarAssinaturaComCartao(
    userId: string,
    plano: Plano,
    dados: { cartao: DadosCartao; titular: DadosTitular },
    remoteIp: string,
  ): Promise<{ assinaturaId: string; ultimos4: string; bandeira: string }> {
    const precoCentavos = await this.precoDoPlano(plano);
    const customerId = await this.garantirCustomer(userId, {
      exigirDocumento: true,
    });
    const assinaturaLocal = await this.assinaturas.findOne({
      where: { userId },
    });
    // Lida UMA vez e usada nos DOIS lugares: a data que vai ao provedor e a
    // decisão de marcar a assinatura localmente. Calcular de novo abriria a
    // porta para as duas discordarem — que é como este bug nasceu.
    const adiada = dataDaPrimeiraCobranca(assinaturaLocal);

    let criada: AsaasSubscriptionComCartao & { id: string };
    try {
      criada = await this.cliente().post<
        AsaasSubscriptionComCartao & { id: string }
      >('/subscriptions', {
        customer: customerId,
        billingType: 'CREDIT_CARD',
        value: centavosParaReais(precoCentavos),
        nextDueDate: this.primeiroVencimento(adiada),
        cycle: CICLO_ASAAS[plano],
        description: `PrumoLicita — plano ${plano}`,
        externalReference: userId,
        creditCard: dados.cartao,
        creditCardHolderInfo: dados.titular,
        remoteIp,
      });
    } catch (erro) {
      // ⚠️ Só a mensagem do provedor. O corpo JAMAIS entra no log — seria dado
      // de cartão em disco, que é exatamente o que o SAQ A-EP proíbe.
      this.logger.error(
        `Falha ao criar assinatura com cartão para ${userId}: ${this.msg(erro)}`,
      );
      throw erro;
    }

    await this.assinaturas.update(
      { userId },
      this.patchAposCriar(assinaturaLocal, criada.id, plano, adiada),
    );

    const cartao = criada.creditCard;
    return {
      assinaturaId: criada.id,
      // Só o mascarado. O PAN não volta daqui para lugar nenhum.
      ultimos4: cartao?.creditCardNumber ?? '',
      bandeira: cartao?.creditCardBrand ?? '',
    };
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
  ): Promise<{ assinaturaId: string; pagarUrl: string | null }> {
    const precoCentavos = await this.precoDoPlano(plano);
    const customerId = await this.garantirCustomer(userId, {
      exigirDocumento: true,
    });
    // Lido ANTES de criar: depois do `update` abaixo o estado anterior some, e é
    // ele que diz se isto é uma assinatura nova, uma reativação ou um trial.
    const assinaturaLocal = await this.assinaturas.findOne({
      where: { userId },
    });
    const adiada = dataDaPrimeiraCobranca(assinaturaLocal);

    const criada = await this.cliente().post<{ id: string; status?: string }>(
      '/subscriptions',
      {
        customer: customerId,
        billingType: 'UNDEFINED',
        value: centavosParaReais(precoCentavos),
        // Não cobra de novo o que já foi concedido — ver `dataDaPrimeiraCobranca`.
        nextDueDate: this.primeiroVencimento(adiada),
        cycle: CICLO_ASAAS[plano],
        description: `PrumoLicita — plano ${plano}`,
        // Mesmo papel do `metadata.userId` da Stripe: o webhook acha o dono sem
        // depender do e-mail, que a pessoa troca no meio do caminho.
        externalReference: userId,
        // Traz o pagador de volta em vez de deixá-lo parado na página do
        // provedor. Sem isto, quem escolhia boleto/Pix saía do produto para
        // pagar e simplesmente não voltava — não havia caminho de retorno.
        //
        // ⚠️ **Só resolve o PIX, e é importante saber por quê.** A doc é
        // literal: o `successUrl` é acionado "após o pagamento com sucesso da
        // fatura". Pix é pago NA PÁGINA, então o redirecionamento acontece.
        // Boleto é pago no BANCO, dias depois — quem imprime o boleto fecha a
        // aba e nunca passa por aqui. Para esse caso o caminho de volta é a
        // cobrança em aberto no `/assinatura`, com o link de pagamento.
        //
        // ⚠️ **Voltar por aqui NÃO significa acesso liberado**: quem libera é o
        // webhook (T-214), e ele pode chegar depois. A tela de destino trata os
        // dois estados — se ela passar a afirmar "confirmada" só por ter sido
        // aberta, vira a mentira que o `success_url` da Stripe já ensinou a não
        // cometer (§8).
        callback: {
          successUrl: `${this.webOrigin}/assinatura/confirmada`,
          autoRedirect: true,
        },
      },
    );

    // O id é gravado IMEDIATAMENTE: entre criar lá e gravar aqui existe uma
    // janela em que a assinatura seria órfã, e o Asaas não tem idempotência
    // para desfazer isso (T-212). Gravar antes de qualquer outra coisa encurta
    // a janela ao mínimo.
    await this.assinaturas.update(
      { userId },
      this.patchAposCriar(assinaturaLocal, criada.id, plano, adiada),
    );
    // ⚠️ `provider` é escrito AQUI, não na criação do cliente: é neste ponto que
    // a cobrança passa a existir do outro lado. Quando a cobrança é HOJE, o
    // STATUS continua intocado — quem LIBERA acesso é o webhook (T-214). A
    // exceção, e por que ela existe, está em `patchAposCriar`.

    // A 1ª cobrança já nasce com a assinatura; a URL dela é a página HOSPEDADA
    // onde o pagador escolhe boleto ou Pix. Sem devolvê-la, o usuário assinaria
    // e ficaria sem saber COMO pagar — que é o buraco que esta task fechou.
    return {
      assinaturaId: criada.id,
      pagarUrl: await this.primeiraCobrancaUrl(criada.id),
    };
  }

  /**
   * URL de pagamento da 1ª cobrança da assinatura.
   *
   * Falha aqui NÃO desfaz a assinatura — ela já existe do outro lado, e desfazer
   * seria pior. O chamador trata `null` avisando para tentar de novo; a cobrança
   * também aparece no portal (T-216), então o caminho não fica perdido.
   */
  private async primeiraCobrancaUrl(subId: string): Promise<string | null> {
    try {
      const lista = await this.cliente().get<ListaAsaas<AsaasPayment>>(
        `/subscriptions/${subId}/payments?limit=1`,
      );
      return lista.data?.[0]?.invoiceUrl ?? null;
    } catch (erro) {
      this.logger.error(
        `Assinatura ${subId} criada, mas sem URL de cobrança: ${this.msg(erro)}`,
      );
      return null;
    }
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
   * ⚠️ `updatePendingPayments` NÃO é mais fixo em `false`, e a mudança tem
   * história. Ele foi medido no sandbox (30/07): trocar R$100/mês por R$1499/ano
   * deixava a cobrança **já gerada** em R$100 com o `nextDueDate` intacto — e
   * `false` era o certo, porque reescrever cobrança que o cliente já pagou (ou
   * cujo boleto ele já imprimiu) é mexer em dinheiro que saiu da mão dele.
   *
   * 🔴 **O que aquele raciocínio não previa foi a reativação (T-217).** Lá o
   * `primeiroVencimento` empurra a 1ª cobrança para o fim do período já pago —
   * até um mês, ou um ano, à frente. Nessa janela a cobrança em aberto é de
   * cartão, não chegou a ninguém e não pode ser paga adiantada; o `false` não
   * protegia nada e produzia o bug que o dono achou em produção: cancelou o
   * mensal, reativou, trocou para anual, e a cobrança de setembro seguiu
   * MENSAL, com o anual só valendo em outubro. Quem pediu anual era obrigado a
   * comprar mais um mês avulso antes.
   *
   * Agora quem decide é `podeReescreverCobrancas` (função pura, testada): só
   * reescreve quando TODA cobrança em aberto é de cartão, `PENDING` e vence
   * depois de hoje. Boleto/Pix e qualquer outro status caem no `false` de
   * sempre. **Falha do provedor ao consultar também cai em `false`** — sem saber
   * o que há em aberto, não se mexe em cobrança.
   */
  async trocarPlano(
    userId: string,
    plano: Plano,
  ): Promise<{
    plano: Plano;
    valeAPartirDe: Date | null;
    cobrancaEmAbertoAtualizada: boolean;
  }> {
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
    // Lido ANTES do POST: depois da reescrita as cobranças já refletem o plano
    // novo, e não daria mais para saber se elas eram seguras de tocar.
    const emAberto = await this.cobrancasEmAberto(
      assinatura.asaasSubscriptionId,
    );
    const reescrever = podeReescreverCobrancas(emAberto);

    const atualizada = await this.cliente().post<AsaasSubscriptionResumo>(
      `/subscriptions/${assinatura.asaasSubscriptionId}`,
      {
        value: centavosParaReais(valorCentavos),
        cycle: CICLO_ASAAS[plano],
        updatePendingPayments: reescrever,
      },
    );

    await this.assinaturas.update({ id: assinatura.id }, { plano });
    // ⚠️ As duas datas respondem perguntas diferentes, e trocá-las mente para o
    // cliente. Reescreveu → o plano novo vale já na cobrança em aberto. Não
    // reescreveu → ela segue no valor antigo, e o plano novo só entra no ciclo
    // seguinte (`nextDueDate`).
    const valeAPartirDe = reescrever
      ? primeiroVencimentoEmAberto(emAberto)
      : dataAsaas(atualizada.nextDueDate);
    return { plano, valeAPartirDe, cobrancaEmAbertoAtualizada: reescrever };
  }

  /**
   * Cobranças da assinatura, para decidir se dá para reescrevê-las.
   *
   * ⚠️ **SEM filtro de status na consulta.** Pedir só `PENDING` esconderia uma
   * cobrança `OVERDUE` — que o flag reescreveria assim mesmo, sem a decisão
   * nunca a ter visto. Quem separa liquidada de em aberto é
   * `podeReescreverCobrancas`, com allowlist.
   *
   * ⚠️ Erro aqui devolve lista VAZIA de propósito, e vazia significa "não
   * reescreve" em `podeReescreverCobrancas`. É a direção barata do erro: no pior
   * caso a troca vale só no ciclo seguinte (o comportamento de sempre), em vez
   * de reescrevermos às cegas uma cobrança que talvez já esteja paga.
   */
  private async cobrancasEmAberto(subId: string): Promise<CobrancaPendente[]> {
    try {
      const lista = await this.cliente().get<ListaAsaas<AsaasPayment>>(
        `/subscriptions/${subId}/payments?limit=${COBRANCAS_LIMITE}`,
      );
      return lista.data ?? [];
    } catch (erro) {
      this.logger.error(
        `Falha ao ler cobranças em aberto de ${subId} na troca de plano: ${this.msg(erro)}`,
      );
      return [];
    }
  }

  /**
   * Cancela a assinatura (T-217) — **self-service, sem abrir chamado**.
   *
   * ── O que o Asaas faz, MEDIDO no sandbox (31/07) ──
   *
   * `DELETE /subscriptions/{id}` responde `{deleted: true}`. Depois disso o GET
   * ainda funciona e devolve **`deleted: true` E `status: "INACTIVE"`** — dois
   * sinais para o mesmo fato, exatamente a armadilha que a T-144 documentou na
   * Stripe. E a assinatura **some da listagem** `GET /subscriptions`: só o GET
   * direto por id a encontra.
   *
   * 🔴 **NÃO EXISTE "cancelar no fim do período" no Asaas.** O cancelamento é
   * imediato e terminal do lado dele. O "acesso até o fim do que já foi pago" é
   * 100% regra NOSSA, e ela já existe: `calcularAcesso` libera `CANCELED`
   * enquanto `currentPeriodEnd` estiver no futuro (T-144). É por isso que este
   * método **não toca no `currentPeriodEnd`** — apagá-lo cortaria o acesso na
   * hora, ou seja, cobraria um mês e entregaria meio.
   *
   * ⚠️ **A cobrança EM ABERTO é apagada junto** (medido: `/payments` foi de 1
   * para zero). É o comportamento nativo e foi **aceito pelo dono (31/07)**, com
   * a razão que sustenta a decisão: **a cobrança é PRÉ-PAGA** — ela financia o
   * ciclo que vem, não o que já foi consumido. Cancelar antes de pagá-la não
   * perdoa dívida de uso; cancela um adiantamento. **Não "conserte" isto
   * recriando a cobrança como avulsa:** seria cobrar quem já saiu, por um
   * período que não vai usar.
   *
   * ⚠️ **A ORDEM É PROVEDOR PRIMEIRO, BANCO DEPOIS**, e as duas falhas não são
   * simétricas:
   *   - banco cancelado + provedor ativo = cortamos o acesso no fim do período
   *     **e seguimos cobrando todo mês**. É o pior resultado possível.
   *   - provedor cancelado + banco intacto = ninguém é cobrado, o cliente segue
   *     com acesso, e a reconciliação (T-223) conserta.
   * Errar para o lado barato é a decisão; por isso o `update` local só acontece
   * depois do `DELETE` responder.
   */
  async cancelar(
    userId: string,
    motivo: MotivoCancelamento,
    detalhe: string | undefined,
    now: Date = new Date(),
  ): Promise<{ canceladoEm: Date; acessoAte: Date | null }> {
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    // Idempotente: cancelar duas vezes não fala com o provedor de novo, e não
    // reescreve o motivo já declarado. O botão pode ser clicado duas vezes.
    if (assinatura.status === AssinaturaStatus.CANCELED) {
      return {
        canceladoEm: assinatura.canceladoEm ?? now,
        acessoAte: assinatura.currentPeriodEnd,
      };
    }

    if (!assinatura.asaasSubscriptionId) {
      // Trial: não há assinatura no provedor, logo não há o que cancelar. Quem
      // está em trial simplesmente não converte — e dizer isso é melhor que um
      // erro genérico numa tela de cancelamento.
      throw new BadRequestException(
        'Você ainda não tem uma assinatura paga. O teste grátis termina sozinho, sem cobrança.',
      );
    }

    // 🔴 Rede de segurança encontrada em dev (31/07): a assinatura Asaas ativa
    // estava com `currentPeriodEnd` NULO — e sem essa data `calcularAcesso`
    // NEGA o acesso assim que o status vira `canceled`. Ou seja, cancelar
    // cortaria na hora exatamente o que a T-144 promete manter.
    //
    // Quem preenche a data no caminho normal é o webhook, na confirmação do
    // pagamento (`fimDoPeriodo`). Ela fica nula quando aquela leitura falha na
    // PRIMEIRA cobrança — o webhook preserva o valor anterior, que não existe.
    // Aqui é o último momento em que dá para perguntar ao provedor, então
    // perguntamos, **antes** do DELETE.
    const fimDoPeriodo =
      assinatura.currentPeriodEnd ??
      (await this.fimDoPeriodoSeAtiva(assinatura));

    await this.apagarNoProvedor(assinatura.asaasSubscriptionId);

    await this.assinaturas.update(
      { id: assinatura.id },
      {
        status: AssinaturaStatus.CANCELED,
        // Só escreve quando havia buraco a tapar — o caminho normal não toca
        // nesta coluna (ver o cabeçalho).
        ...(assinatura.currentPeriodEnd == null && fimDoPeriodo
          ? { currentPeriodEnd: fimDoPeriodo }
          : {}),
        // Mantém o contrato que a tela já lê da Stripe: "cancelada, não renova,
        // acesso até X" (T-144). Sem isto a tela do Asaas teria de aprender uma
        // segunda forma de dizer a mesma coisa.
        cancelAtPeriodEnd: true,
        canceladoEm: now,
        cancelamentoMotivo: motivo,
        cancelamentoDetalhe: detalhe ?? null,
        // ⚠️ Carimbo de ordem, e aqui ele PROTEGE: um `PAYMENT_CONFIRMED` que
        // já estava a caminho quando o cliente cancelou chegaria depois e
        // devolveria a assinatura para `ACTIVE` — ressuscitando o que acabou de
        // ser cancelado. Com o carimbo em `now`, a guarda do webhook o descarta.
        asaasAtualizadoEm: now,
        // ⚠️ `currentPeriodEnd` NÃO entra aqui de propósito — ver o cabeçalho.
      },
    );

    this.emSegundoPlano(
      this.avisarCancelamento(userId, assinatura.currentPeriodEnd),
      'confirmação de cancelamento',
    );

    return { canceladoEm: now, acessoAte: fimDoPeriodo };
  }

  /**
   * `nextDueDate` da assinatura no provedor — **só para quem está `ACTIVE`**.
   *
   * ⚠️ O recorte por `ACTIVE` é a parte que importa: só chega em `active` quem
   * teve pagamento confirmado (é o webhook que promove, T-214). Fazer isto para
   * um `past_due` daria acesso pago a quem **não pagou** — o `nextDueDate` de
   * uma assinatura inadimplente aponta para o futuro do mesmo jeito. Quem manda
   * no acesso do inadimplente é a carência (`pastDueDesde`), não esta data.
   *
   * Falha de rede não bloqueia o cancelamento: devolve `null` e segue. Pior um
   * fim de acesso desconhecido do que um cliente impedido de cancelar.
   */
  private async fimDoPeriodoSeAtiva(
    assinatura: Assinatura,
  ): Promise<Date | null> {
    if (assinatura.status !== AssinaturaStatus.ACTIVE) return null;
    try {
      const sub = await this.cliente().get<AsaasSubscriptionResumo>(
        `/subscriptions/${assinatura.asaasSubscriptionId}`,
      );
      return dataAsaas(sub.nextDueDate);
    } catch (erro) {
      this.logger.error(
        `Não foi possível ler o fim do período de ${assinatura.asaasSubscriptionId}: ${this.msg(erro)}`,
      );
      return null;
    }
  }

  /**
   * `DELETE` no provedor, tolerando só o caso em que ela já não existe lá.
   *
   * 404 significa que o outro lado já não tem essa assinatura — insistir em
   * falhar deixaria o cliente **preso**, sem conseguir cancelar um contrato que
   * de fato já acabou. Qualquer outro erro sobe e nada é escrito localmente.
   */
  private async apagarNoProvedor(subId: string): Promise<void> {
    try {
      await this.cliente().delete<{ deleted?: boolean }>(
        `/subscriptions/${subId}`,
      );
    } catch (erro) {
      if (erro instanceof AsaasError && erro.status === 404) {
        this.logger.warn(
          `Assinatura ${subId} já não existia no Asaas — cancelamento seguiu só localmente.`,
        );
        return;
      }
      this.logger.error(
        `Falha ao cancelar a assinatura ${subId} no Asaas: ${this.msg(erro)}`,
      );
      throw erro;
    }
  }

  /** E-mail de confirmação. Nunca bloqueia a resposta HTTP (§8). */
  private async avisarCancelamento(
    userId: string,
    acessoAte: Date | null,
  ): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) return;
    await this.mail.sendMail({
      to: user.email,
      ...emailAssinaturaCancelada(
        user.name,
        this.dataLabel(acessoAte),
        `${this.webOrigin}/assinatura`,
      ),
    });
  }

  /**
   * Data para o cliente ler, **no fuso de Brasília**.
   *
   * ⚠️ O servidor roda em UTC (§8) e o `currentPeriodEnd` é um instante — sem
   * fixar o fuso, um vencimento à meia-noite sai com o dia anterior no e-mail.
   * É o mesmo defeito que o `format.ts` do front corrigiu em 25/06.
   */
  private dataLabel(data: Date | null): string | null {
    if (!data) return null;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(data);
  }

  /**
   * Dispara sem esperar. Mesmo motivo do `auth.service.ts` (§8): o e-mail é
   * efeito colateral do cancelamento, não parte dele — um provedor pendurado não
   * pode fazer o cliente achar que o cancelamento falhou e clicar de novo.
   */
  private emSegundoPlano(envio: Promise<void>, contexto: string): void {
    void envio.catch((e) =>
      this.logger.warn(`Falha ao enviar ${contexto}: ${this.msg(e)}`),
    );
  }

  /**
   * Troca o cartão da assinatura, SEM cobrar na hora.
   *
   * 🔴 ESTE É O ÚNICO CAMINHO DO PROJETO QUE TOCA EM DADO DE CARTÃO. Decisão do
   * dono (31/07): aceitar o escopo **PCI SAQ A-EP** para ter troca self-service
   * — sem ela, cartão vencido derrubava o cliente em `past_due` sem saída.
   *
   * INVARIANTES (quebrar qualquer uma é incidente de conformidade):
   *   1. **Nada de cartão é PERSISTIDO.** Nem número, nem CVV, nem validade. O
   *      que gravamos é o mascarado que o Asaas devolve (4 últimos + bandeira).
   *   2. **Nada de cartão vai para LOG.** Nem em erro, nem em Sentry — repare
   *      que o catch abaixo registra só a mensagem do provedor, nunca o corpo.
   *   3. **Nada de cartão volta na RESPOSTA.**
   *   4. O `remoteIp` é o IP do CLIENTE, não do servidor — exigência do Asaas
   *      para análise antifraude. Vem da função única da T-204.
   */
  async trocarCartao(
    userId: string,
    dados: { cartao: DadosCartao; titular: DadosTitular },
    remoteIp: string,
  ): Promise<{ ultimos4: string; bandeira: string }> {
    const assinatura = await this.assinaturas.findOne({ where: { userId } });
    if (!assinatura?.asaasSubscriptionId) {
      throw new BadRequestException(
        'Você ainda não tem uma assinatura ativa para trocar o cartão.',
      );
    }

    let resposta: AsaasSubscriptionComCartao;
    try {
      resposta = await this.cliente().put<AsaasSubscriptionComCartao>(
        `/subscriptions/${assinatura.asaasSubscriptionId}/creditCard`,
        {
          creditCard: dados.cartao,
          creditCardHolderInfo: dados.titular,
          remoteIp,
        },
      );
    } catch (erro) {
      // ⚠️ Só a mensagem do provedor. O corpo da requisição JAMAIS entra aqui —
      // seria dado de cartão em log, que é exatamente o que o SAQ A-EP proíbe.
      this.logger.error(
        `Falha ao trocar cartão da assinatura ${assinatura.asaasSubscriptionId}: ${this.msg(erro)}`,
      );
      throw erro;
    }

    const cartao = resposta.creditCard;
    if (!cartao?.creditCardNumber) {
      throw new ServiceUnavailableException(
        'O cartão foi enviado, mas o provedor não confirmou a troca. Confira em instantes.',
      );
    }
    // Só o mascarado — é o que a tela mostra e o máximo que podemos guardar.
    return {
      ultimos4: cartao.creditCardNumber,
      bandeira: cartao.creditCardBrand ?? '',
    };
  }

  /**
   * Cobranças em aberto da conta inteira, indexadas pela assinatura (T-220).
   *
   * 🔴 **Uma chamada para toda a régua**, e é de propósito: os três avisos
   * (pré-vencimento, falha e corte iminente) precisam do MESMO dado — meio de
   * pagamento e link de pagamento da cobrança em aberto. Consultar por
   * assinatura, um a um, seria N chamadas por execução do cron para responder
   * uma pergunta que a listagem responde de uma vez.
   *
   * ⚠️ **O `meio` é o que decide o TEXTO do e-mail**, não um enfeite: cartão
   * retenta sozinho, boleto/Pix não acontecem se ninguém pagar. Mandar o texto
   * errado promete um resgate que não existe.
   *
   * ⚠️ Recorte deliberado: só o que vence até `ateDias` à frente. Cobrança de um
   * ciclo distante não interessa a nenhum dos avisos, e traze-la encheria a
   * página. **Se a listagem estourar o limite, o log avisa** — teto silencioso
   * numa régua de cobrança viraria cliente sem aviso, que é o oposto da task.
   */
  async cobrancasAbertasPorAssinatura(
    ateDias = 10,
    now: Date = new Date(),
  ): Promise<Map<string, CobrancaAsaas>> {
    const limite = dataBrasiliaISO(
      new Date(now.getTime() + ateDias * 86_400_000),
    );
    const mapa = new Map<string, CobrancaAsaas>();
    let lista: ListaAsaas<AsaasPayment & { subscription?: string }>;
    try {
      lista = await this.cliente().get<
        ListaAsaas<AsaasPayment & { subscription?: string }>
      >(`/payments?dueDate%5Ble%5D=${limite}&limit=100`);
    } catch (erro) {
      // Falha aqui NÃO pode derrubar a régua: sem o meio, o chamador ainda
      // consegue avisar com o texto neutro. Silêncio é que seria inaceitável.
      this.logger.error(
        `Falha ao listar cobranças em aberto da conta: ${this.msg(erro)}`,
      );
      return mapa;
    }
    if ((lista.totalCount ?? 0) > 100) {
      this.logger.warn(
        `Listagem de cobranças truncada em 100 (total ${lista.totalCount}) — a régua pode não ver todas.`,
      );
    }
    for (const p of lista.data ?? []) {
      // Só o que ainda espera pagamento. `RECEIVED`/`CONFIRMED` não geram aviso.
      if (p.status !== 'PENDING' && p.status !== 'OVERDUE') continue;
      if (!p.subscription) continue;
      // A mais PRÓXIMA de vencer ganha: é a que o cliente precisa resolver.
      const atual = mapa.get(p.subscription);
      const nova = this.mapearCobranca(p);
      if (
        !atual ||
        (nova.vencimento &&
          atual.vencimento &&
          nova.vencimento.getTime() < atual.vencimento.getTime())
      ) {
        mapa.set(p.subscription, nova);
      }
    }
    return mapa;
  }

  /**
   * Cobranças CRUAS de uma assinatura — para a POLÍTICA de reembolso (T-218).
   *
   * ⚠️ Separado do `detalhesPortal` de propósito. O `CobrancaAsaas` é o recorte
   * da TELA e não carrega `paymentDate` nem `billingType` crus, que é justamente
   * o que a política precisa: a data de PAGAMENTO (não de vencimento) inicia o
   * prazo do CDC, e o meio decide se o estorno cabe na API. Ampliar aquele tipo
   * por causa daqui misturaria dois consumidores com necessidades diferentes.
   */
  async cobrancasCruas(subId: string): Promise<AsaasPayment[]> {
    try {
      const lista = await this.cliente().get<ListaAsaas<AsaasPayment>>(
        `/subscriptions/${subId}/payments?limit=${COBRANCAS_LIMITE}`,
      );
      return lista.data ?? [];
    } catch (erro) {
      this.logger.error(
        `Falha ao listar cobranças de ${subId}: ${this.msg(erro)}`,
      );
      return [];
    }
  }

  /**
   * Cobranças recentes da CONTA inteira — base da lista de reembolso (T-218).
   *
   * ⚠️ Uma chamada para todos, não uma por assinante: o objeto de cobrança traz
   * `subscription`, então o cruzamento com o nosso banco é local. Consultar
   * assinatura por assinatura seria N chamadas de rede para a mesma resposta.
   *
   * ⚠️ Falha devolve lista VAZIA: a tela mostra "ninguém elegível" em vez de
   * quebrar. É leitura para decidir, não caminho de pagamento.
   */
  async pagamentosRecentes(limite = 100): Promise<AsaasPayment[]> {
    try {
      const lista = await this.cliente().get<ListaAsaas<AsaasPayment>>(
        `/payments?limit=${limite}`,
      );
      return lista.data ?? [];
    } catch (erro) {
      this.logger.error(
        `Falha ao listar cobranças da conta: ${this.msg(erro)}`,
      );
      return [];
    }
  }

  /**
   * Estorna uma cobrança (T-218).
   *
   * ⚠️ **Integral, sempre — e não é preferência nossa.** A API do Asaas aceita
   * `value` parcial só em Pix; em CARTÃO o estorno é "completo apenas". Um
   * reembolso proporcional funcionaria para uns e falharia para outros, o que é
   * pior que não oferecer. Integral também é o que a T-157 assume: só o
   * reembolso integral corta o acesso.
   *
   * ⚠️ Não trata a resposta como conclusão: quem confirma que o dinheiro voltou
   * é o webhook `PAYMENT_REFUNDED`, e é ele que corta o acesso.
   */
  async estornar(paymentId: string): Promise<void> {
    await this.cliente().post(`/payments/${paymentId}/refund`, {});
    this.logger.log(`Estorno solicitado para a cobrança ${paymentId}.`);
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

  /**
   * Preços dos planos, como a tela precisa (T-216).
   *
   * ⚠️ Mesma FORMA que a Stripe devolve, FONTE diferente: lá o valor vem do
   * catálogo de `Price`; aqui vem do nosso config store, porque o Asaas não tem
   * catálogo (T-213). A tela não precisa saber a diferença.
   */
  async listarPrecos(): Promise<PrecosResponse> {
    const precos = await this.configStore.getPrecos();
    if (!precos) {
      throw new ServiceUnavailableException(
        'Cobrança indisponível: preço da assinatura não configurado.',
      );
    }
    // `priceId` não existe no Asaas — a assinatura carrega o valor, não um id de
    // catálogo. Fica vazio em vez de inventado: a tela não usa, e um id falso
    // viraria pista errada em log.
    const mensal: PrecoPlano = {
      plano: 'mensal',
      priceId: '',
      valor: precos.mensalCentavos,
      moeda: 'brl',
    };
    const anual: PrecoPlano = {
      plano: 'anual',
      priceId: '',
      valor: precos.anualCentavos,
      moeda: 'brl',
    };
    // Reusa a MESMA comparação da Stripe (T-131/T-164): o arredondamento para
    // baixo dos "meses grátis" é regra de honestidade comercial, e duplicá-la
    // aqui seria a chance de ela divergir.
    const comparacao = compararPlanos(mensal, anual);
    return {
      mensal,
      anual,
      economiaAnual: comparacao?.economiaAnual ?? null,
      mesesGratis: comparacao?.mesesGratis ?? null,
    };
  }

  /**
   * Data da PRIMEIRA cobrança, no formato do Asaas (`YYYY-MM-DD`).
   *
   * A REGRA é a `dataDaPrimeiraCobranca` (pura, testada em `acesso.ts`) —
   * reativação dentro do período pago e conversão de trial com dias restantes
   * são adiadas; o resto cobra hoje. Aqui só sobra a formatação, que é do
   * provedor, e ela vai pelo calendário de BRASÍLIA de propósito: um dia de erro
   * aqui é um dia de cobrança adiantada.
   */
  private primeiroVencimento(adiada: Date | null): string {
    return adiada ? dataBrasiliaISO(adiada) : hojeISO();
  }

  /**
   * O que gravar LOCALMENTE logo depois de criar a assinatura no provedor.
   *
   * 🔴 **Quando a 1ª cobrança foi ADIADA, nenhum webhook de pagamento chega
   * hoje** — ele só vem quando a cobrança vencer, o que pode ser daqui a dias
   * (fim do trial) ou meses (fim do período pago). Esperar por ele deixa a
   * plataforma dizendo que a pessoa não assinou **depois de ela ter assinado**,
   * que é o pior desfecho possível logo após um pagamento.
   *
   * Este bug já aconteceu DUAS vezes, pelos dois lados da mesma regra:
   *   - **reativação** (31/07): a tela seguia "Cancelada · acesso até X" e a
   *     pessoa concluía, com razão, que reativar não funcionava;
   *   - **conversão de trial** (03/08): assinou, o Asaas criou, e a plataforma
   *     continuou mostrando o trial. Foi introduzido junto com o adiamento do
   *     trial — o adiamento veio, a contrapartida local não.
   *
   * Por isso a condição aqui é **"a cobrança foi adiada"**, não "está
   * reativando": é a pergunta que de fato importa, e cobre os dois casos com
   * uma regra só. Amarrar em `reativando` foi o que deixou o segundo passar.
   *
   * ⚠️ **Isto NÃO libera acesso de graça.** Só se aplica a quem JÁ tem acesso
   * (trial em andamento ou período pago em aberto) — `calcularAcesso` continua
   * mandando. O que muda é o significado do estado: "está no trial" e "não vai
   * renovar" passam a ser "assinou". Se o pagamento falhar no vencimento, o
   * webhook derruba para `past_due` e a carência (T-220) assume.
   *
   * ⚠️ O `currentPeriodEnd` recebe a data adiada porque é literalmente a próxima
   * cobrança — e é o que a tela mostra. Na reativação ele já valia isso (escrita
   * idempotente); na conversão de trial era NULO, e sem ele a confirmação exibia
   * "—" onde deveria estar a data.
   */
  private patchAposCriar(
    assinaturaLocal: Assinatura | null,
    subId: string,
    plano: Plano,
    adiada: Date | null,
  ): Partial<Assinatura> {
    const base: Partial<Assinatura> = {
      asaasSubscriptionId: subId,
      provider: 'asaas',
      plano,
    };
    if (!adiada) {
      // Cobrança hoje: o webhook chega em segundos e é ELE quem ativa (T-214).
      // Antecipar o status aqui seria dizer "pago" antes de o dinheiro entrar.
      return base;
    }
    return {
      ...base,
      status: AssinaturaStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: adiada,
      // Reativação: quem volta não continua marcado como quem saiu.
      ...(assinaturaLocal?.status === AssinaturaStatus.CANCELED
        ? { canceladoEm: null }
        : {}),
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
