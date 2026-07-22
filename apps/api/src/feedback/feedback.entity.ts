import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Reporte de problema/feedback in-app (T-202). Com 10–20 construtoras no beta, é
// assim que um bug classe T-166 chega em horas em vez de você descobrir no churn.
// Fecha o ciclo com o relatório de QA — que foi exatamente esse tipo de sinal, só
// que manual.
@Index('IDX_feedback_status_created', ['status', 'createdAt'])
@Entity('feedback')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Quem reportou (do JWT). Contexto para o dono responder/ligar.
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  // Rota onde o problema foi reportado (ex.: /orcamentos/:id) — ajuda a repro.
  @Column({ type: 'varchar', length: 255, nullable: true })
  rota!: string | null;

  // Versão do front (se o build informar) — separa "bug já corrigido" de novo.
  @Column({ type: 'varchar', length: 40, nullable: true })
  versao!: string | null;

  @Column({ type: 'text' })
  mensagem!: string;

  // 'novo' | 'lido' | 'resolvido'.
  @Column({ type: 'varchar', length: 20, default: 'novo' })
  status!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
