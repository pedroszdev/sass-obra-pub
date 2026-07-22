import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

// Correção humana da classificação de obra (T-191). Vira DATASET rotulado (mesmo
// espírito da T-200) — insumo da T-140 (classificar por intenção com IA) e mede/
// reduz o ruído do "favor recall" (§3.3) com o tempo. UNIQUE por edital: revisar
// de novo atualiza.
@Unique('UQ_classifier_review_edital', ['editalId'])
@Entity('classifier_review')
export class ClassifierReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'edital_id' })
  editalId!: string;

  // Veredito do humano: 'obra' | 'nao_obra'.
  @Column({ type: 'varchar', length: 10 })
  veredito!: string;

  // Razão que o classificador tinha dado (forte/fraco-verbo/modalidade/nao-obra)
  // — guardada para medir onde ele erra.
  @Column({
    type: 'varchar',
    length: 20,
    name: 'razao_original',
    nullable: true,
  })
  razaoOriginal!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
