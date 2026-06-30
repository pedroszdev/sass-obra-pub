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
import { decimalTransformer } from '../../common/decimal.transformer';
import { Edital } from '../edital.entity';
import { ItemPlanilha } from './itens.types';

// Resultado (cacheado) da extração da planilha de itens por IA (T-64).
// CLAUDE.md §3.4: cache obrigatório — extrair custa chamada de API por edital,
// nunca reprocessar. Espelha edital_exigencias (T-49); 1:1 com `editais`.
export enum ItensStatus {
  // IA leu a planilha e extraiu os itens.
  EXTRAIDO = 'extraido',
  // Não há planilha extraível (sem anexo, .xls binário, ou texto sem planilha).
  INDISPONIVEL = 'indisponivel',
  // Falha na extração (rede/IA) — re-tentável (não é cache final).
  ERRO = 'erro',
}

@Index('UQ_edital_itens_extracao_edital', ['editalId'], { unique: true })
@Entity('edital_itens_extracao')
export class EditalItensExtracao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'edital_id' })
  editalId!: string;

  @ManyToOne(() => Edital, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'edital_id' })
  edital?: Edital;

  @Column({ type: 'enum', enum: ItensStatus })
  status!: ItensStatus;

  // Itens estruturados da planilha (null quando indisponível/erro).
  @Column({ type: 'jsonb', nullable: true })
  itens!: ItemPlanilha[] | null;

  // Formato da planilha de onde veio (pdf/xlsx) — auditoria.
  @Column({ type: 'varchar', length: 10, nullable: true })
  formato!: string | null;

  // Documento de onde o texto foi extraído (auditoria).
  @Column({
    type: 'varchar',
    length: 255,
    name: 'documento_nome',
    nullable: true,
  })
  documentoNome!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modelo!: string | null;

  @Column({ type: 'int', name: 'prompt_tokens', nullable: true })
  promptTokens!: number | null;

  @Column({ type: 'int', name: 'completion_tokens', nullable: true })
  completionTokens!: number | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 6,
    name: 'custo_usd',
    nullable: true,
    transformer: decimalTransformer,
  })
  custoUsd!: number | null;

  @Column({ type: 'text', nullable: true })
  erro!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
