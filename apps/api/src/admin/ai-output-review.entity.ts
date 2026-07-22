import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

// Conferência de saídas de IA (T-200). Cada linha é o veredito do dono sobre uma
// saída (resumo, exigências ou itens da planilha) de um edital. Vira DATASET
// rotulado (mesmo espírito da T-191) e alimenta a taxa de acerto VIVA, com o
// modelo em produção — o §3.4 exige medir o erro em editais reais.
//
// UNIQUE (tipo, edital_id): remarcar atualiza o veredito, não duplica.
@Unique('UQ_ai_output_review_tipo_edital', ['tipo', 'editalId'])
@Entity('ai_output_review')
export class AiOutputReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 'resumo' | 'exigencias' | 'itens'. Resumo e exigências saem da MESMA chamada
  // (edital_exigencias), mas são revisados separadamente — o resumo é o "uau" que
  // o cliente vê.
  @Column({ type: 'varchar', length: 20 })
  tipo!: string;

  @Column({ type: 'uuid', name: 'edital_id' })
  editalId!: string;

  // 'ok' | 'errado'.
  @Column({ type: 'varchar', length: 10 })
  veredito!: string;

  @Column({ type: 'text', nullable: true })
  nota!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
