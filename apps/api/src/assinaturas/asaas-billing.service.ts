import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AsaasClient } from './asaas-client';
import { ASAAS_CLIENT } from './asaas.provider';
import { Assinatura } from './assinatura.entity';

// Cobrança pelo Asaas (Épico 17). Esta task (T-212) entrega SÓ o cliente —
// assinatura, checkout e webhook vêm em T-213/T-214.
//
// ⚠️ Convive com o `StripeBillingService` de propósito: até o corte (T-224) quem
// cobra em produção é a Stripe. Nada aqui é chamado por controller ainda.

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
