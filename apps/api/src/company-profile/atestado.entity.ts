import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../common/decimal.transformer';

// Atestado de capacidade técnica do empreiteiro (BACKLOG T-40). N por usuário.
// Comprova que a empresa já executou obra de certo tipo/porte — base para o
// requisito de "capacidade técnica" no diagnóstico de prontidão (T-44/T-45/T-51).
// quantitativo + unidade guardam o tamanho (ex.: 1200 m²); valor, o porte
// financeiro. A FK (ON DELETE CASCADE) é feita na migration.
@Index('IDX_atestados_user', ['userId'])
@Entity('atestados')
export class Atestado {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  // Objeto / tipo de obra atestado (ex.: "pavimentação asfáltica de vias").
  @Column({ type: 'text' })
  descricao!: string;

  // Quantitativo executado e sua unidade (ex.: 1200 / "m²").
  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  quantitativo!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unidade!: string | null;

  // Valor do contrato atestado, em reais (porte financeiro da obra executada).
  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  valor!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contratante!: string | null;

  @Column({ type: 'int', nullable: true })
  ano!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
