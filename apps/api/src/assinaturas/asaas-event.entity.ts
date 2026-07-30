import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Evento do Asaas já processado (T-211, consumido pela T-214). Espelha o
// `stripe_events`: a chave primária é o `id` DO EVENTO no provedor, e é isso que
// torna o webhook idempotente.
//
// ⚠️ Aqui a idempotência é MAIS necessária que na Stripe, não menos: o Asaas
// entrega "at least once" declaradamente, e a autenticação é só um token
// estático no header — não há assinatura sobre o corpo cru (medido na T-209).
// A PK é a única barreira contra o mesmo evento virar dois efeitos.
@Entity('asaas_events')
export class AsaasEvent {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  tipo!: string;

  // Instante em que o ASAAS gerou o evento (não em que o recebemos): é por ele
  // que se compara a ordem, já que a entrega não é sequencial garantida.
  //
  // Nullable, ao contrário do equivalente da Stripe: o payload do Asaas não
  // garante o campo de data em todo tipo de evento. Preferimos aceitar o evento
  // sem carimbo a recusá-lo — recusar seria perder uma cobrança confirmada.
  @Column({ type: 'timestamptz', name: 'criado_em_asaas', nullable: true })
  criadoEmAsaas!: Date | null;

  @CreateDateColumn({ name: 'processado_em', type: 'timestamptz' })
  processadoEm!: Date;
}
