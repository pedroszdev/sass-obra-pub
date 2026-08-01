import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { AssinaturaStatus } from './assinatura-status.enum';
import { Plano } from './precos';

// Assinatura do usuário (BACKLOG T-127). Uma por conta — times não existem ainda
// (1 conta = 1 usuário; multi-usuário é a T-87).
//
// O TRIAL NASCE AQUI, NÃO NA STRIPE (decisão do dono): 7 dias, sem cartão. Os
// campos `stripe*` ficam nulos até haver intenção de compra — não criamos um
// `Customer` na Stripe para cada curioso que se cadastra.
@Entity('assinaturas')
export class Assinatura {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 1:1 com o usuário. Cascade: excluir a conta (T-102/LGPD) leva a assinatura.
  @Index('UQ_assinaturas_user', { unique: true })
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 20 })
  status!: AssinaturaStatus;

  // Plano contratado (T-131): mensal ou anual. O webhook/reconciliação o
  // escrevem a partir da assinatura na Stripe (`extrairPlano`) — antes disso o
  // campo existia mas nunca era atualizado.
  //
  // O PREÇO não mora aqui, só o nome do plano: o valor vive na Stripe (T-128) e
  // é lido de lá a cada exibição. Gravá-lo divergiria do que ela cobra de fato.
  @Column({ type: 'varchar', length: 50, default: 'mensal' })
  plano!: Plano;

  // Fim do período de avaliação. Null quando a conta nunca teve trial.
  @Column({ type: 'timestamptz', name: 'trial_ends_at', nullable: true })
  trialEndsAt!: Date | null;

  // Fim do período PAGO corrente (vem da Stripe). É o que sustenta o acesso de
  // quem cancelou: cancelar não corta na hora, vale até o fim do que foi pago.
  @Column({ type: 'timestamptz', name: 'current_period_end', nullable: true })
  currentPeriodEnd!: Date | null;

  // Quando o pagamento passou a falhar (`past_due`) — base da carência antes de
  // bloquear (T-130). Setado pelo webhook (T-129); volta a null quando pagar.
  @Column({ type: 'timestamptz', name: 'past_due_desde', nullable: true })
  pastDueDesde!: Date | null;

  // Ids na Stripe (T-128/T-129). Nulos enquanto o usuário só está no trial.
  @Column({
    type: 'varchar',
    length: 255,
    name: 'stripe_customer_id',
    nullable: true,
  })
  stripeCustomerId!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'stripe_subscription_id',
    nullable: true,
  })
  stripeSubscriptionId!: string | null;

  // ── Asaas (Épico 17, T-211) ──
  //
  // CONVIVEM com os campos da Stripe de propósito, e os da Stripe NÃO serão
  // apagados nesta task: eles são a rede de segurança e o histórico até o corte
  // (T-224). Um usuário pode ter histórico Stripe e assinatura Asaas ao mesmo
  // tempo, e o modelo precisa aguentar isso sem ambiguidade — daí a coluna
  // `provider` abaixo, que diz QUEM está cobrando agora.
  @Column({
    type: 'varchar',
    length: 255,
    name: 'asaas_customer_id',
    nullable: true,
  })
  asaasCustomerId!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'asaas_subscription_id',
    nullable: true,
  })
  asaasSubscriptionId!: string | null;

  // Id do CHECKOUT hospedado que originou a assinatura (T-216, correção).
  //
  // 🔴 É a única ponte entre o que criamos e o que o checkout cria: ele gera um
  // cliente NOVO com os dados que o pagador digita, e a cobrança nasce sem
  // `externalReference`. A assinatura resultante guarda `checkoutSession` — este
  // campo é o outro lado dessa ponte. Sem ele, pagamento confirmado não acha o
  // dono e o cliente fica no trial (bug real, 31/07).
  @Column({
    type: 'varchar',
    length: 255,
    name: 'asaas_checkout_id',
    nullable: true,
  })
  asaasCheckoutId!: string | null;

  // Quem cobra ESTA assinatura hoje. `null` = ninguém ainda — é o estado normal
  // de quem está em trial, porque o trial é NOSSO (T-127) e não existe em
  // provedor nenhum. Preenchido quando a assinatura passa a existir no provedor.
  //
  // ⚠️ Não deduza o provider pela presença dos ids: depois do corte (T-224) uma
  // conta pode ter `stripe_subscription_id` preenchido como HISTÓRICO e estar
  // sendo cobrada pelo Asaas. Quem responde "quem cobra" é este campo.
  @Column({ type: 'varchar', length: 20, nullable: true })
  provider!: 'stripe' | 'asaas' | null;

  // Instante (no Asaas) do último evento de webhook JÁ APLICADO — o mesmo papel
  // do `stripe_atualizado_em`, pelo mesmo motivo: a entrega é "at least once" e
  // sem carimbo um evento atrasado sobrescreve estado mais novo (T-209/T-214).
  @Column({ type: 'timestamptz', name: 'asaas_atualizado_em', nullable: true })
  asaasAtualizadoEm!: Date | null;

  // Cancelamento agendado para o fim do período (T-144). Quem cancela no Portal
  // fica `active` + esta flag: mantém o acesso até `currentPeriodEnd`, mas NÃO vai
  // renovar. É o que a tela usa para dizer "cancelada, acesso até X".
  @Column({
    type: 'boolean',
    name: 'cancel_at_period_end',
    default: false,
  })
  cancelAtPeriodEnd!: boolean;

  // ── Cancelamento self-service (T-217) ──
  //
  // ⚠️ `canceladoEm` NÃO é o fim do acesso. Cancelar não corta na hora (T-144):
  // o acesso vale até `currentPeriodEnd`. Guardar as duas datas é o que permite
  // ao /admin responder "pediu quando?" e "sai quando?" sem confundir uma com a
  // outra — e é a diferença que a tela precisa dizer ao cliente.
  @Column({ type: 'timestamptz', name: 'cancelado_em', nullable: true })
  canceladoEm!: Date | null;

  // Motivo declarado, da lista fechada (`MOTIVOS_CANCELAMENTO`). É o dado que o
  // dono quer ler no beta: por que estão saindo.
  @Column({
    type: 'varchar',
    length: 40,
    name: 'cancelamento_motivo',
    nullable: true,
  })
  cancelamentoMotivo!: string | null;

  // Texto livre opcional. Teto de 500 no banco E no DTO.
  @Column({
    type: 'varchar',
    length: 500,
    name: 'cancelamento_detalhe',
    nullable: true,
  })
  cancelamentoDetalhe!: string | null;

  // Quando a assinatura foi REEMBOLSADA (T-157). Null = não foi.
  //
  // É o único campo de cobrança que NÃO vem da Stripe pelo caminho normal: a
  // reconciliação (T-143) sobrescreveria um `canceled` local, e o `cancelAt`+
  // `currentPeriodEnd` liberariam o acesso pela regra da T-144. Fica FORA do
  // `montarPatch` de propósito — é o fato que sobrevive à reconciliação.
  @Column({ type: 'timestamptz', name: 'reembolsada_em', nullable: true })
  reembolsadaEm!: Date | null;

  // Instante (na Stripe) do último evento de webhook JÁ APLICADO. Os eventos
  // chegam fora de ordem: sem este carimbo, um `updated` atrasado sobrescreveria
  // um estado mais novo e ressuscitaria uma assinatura vencida (T-129).
  @Column({ type: 'timestamptz', name: 'stripe_atualizado_em', nullable: true })
  stripeAtualizadoEm!: Date | null;

  // Concessões manuais do admin (T-185). Ficam FORA do `montarPatch` da Stripe —
  // são fato local, a reconciliação não pode apagá-los.
  //
  // Acesso cortesia: libera o produto sem cartão até esta data (bypass de paywall
  // deliberado). Null = sem cortesia. Sobrepõe o estado de pagamento, inclusive
  // reembolso (decisão do dono).
  @Column({ type: 'timestamptz', name: 'cortesia_ate', nullable: true })
  cortesiaAte!: Date | null;

  // Suspensão: quando o admin bloqueou a conta. Null = não suspensa. Ganha de
  // tudo (inclusive cortesia) — falha fechado.
  @Column({ type: 'timestamptz', name: 'suspenso_em', nullable: true })
  suspensoEm!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
