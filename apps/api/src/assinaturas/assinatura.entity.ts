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

  // Cancelamento agendado para o fim do período (T-144). Quem cancela no Portal
  // fica `active` + esta flag: mantém o acesso até `currentPeriodEnd`, mas NÃO vai
  // renovar. É o que a tela usa para dizer "cancelada, acesso até X".
  @Column({
    type: 'boolean',
    name: 'cancel_at_period_end',
    default: false,
  })
  cancelAtPeriodEnd!: boolean;

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
