import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Evento da Stripe já processado (T-129). A chave primária é o `event.id` DELA:
// é isso que torna o webhook idempotente — a Stripe REENTREGA eventos, e um
// mesmo `invoice.paid` chegando duas vezes não pode virar dois efeitos.
@Entity('stripe_events')
export class StripeEvent {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  tipo!: string;

  // Instante em que a STRIPE gerou o evento (não em que o recebemos): é por ele
  // que se compara a ordem, já que os eventos chegam fora de sequência.
  @Column({ type: 'timestamptz', name: 'criado_em_stripe' })
  criadoEmStripe!: Date;

  @CreateDateColumn({ name: 'processado_em', type: 'timestamptz' })
  processadoEm!: Date;
}
