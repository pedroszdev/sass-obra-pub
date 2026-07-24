import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const BROADCAST_SEGMENTOS = ['todos', 'trial', 'pagantes'] as const;
export type BroadcastSegmento = (typeof BROADCAST_SEGMENTOS)[number];

// Registro de campanha do comunicado ao beta (T-198). O status POR DESTINATÁRIO
// vive no mail_log (T-193, filtrável por assunto); aqui fica a campanha em si —
// quem recebeu o quê, para quando "vivíamos de BCC" virar histórico rastreável.
@Index('IDX_beta_broadcasts_created', ['createdAt'])
@Entity('beta_broadcasts')
export class BetaBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  assunto!: string;

  @Column({ type: 'text' })
  corpo!: string;

  @Column({ type: 'varchar', length: 20 })
  segmento!: BroadcastSegmento;

  // Destinatários resolvidos no momento do envio.
  @Column({ type: 'int' })
  total!: number;

  // 'enviando' enquanto o loop de background roda; 'concluido' ao fim.
  @Column({ type: 'varchar', length: 20, default: 'enviando' })
  status!: string;

  @Column({ type: 'uuid', name: 'created_by_admin_id' })
  createdByAdminId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
