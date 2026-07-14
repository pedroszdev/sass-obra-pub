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

  // Nome do plano. Um só por enquanto ("mensal") — o preço vive na Stripe (T-128),
  // nunca aqui: valor no nosso banco divergiria do que a Stripe cobra de fato.
  @Column({ type: 'varchar', length: 50, default: 'mensal' })
  plano!: string;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
