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
import { Edital } from '../edital.entity';
import { ExigenciasHabilitacao, ResumoEdital } from './exigencias.types';

// Resultado (cacheado) da extração de exigências por IA de um edital (T-49).
// CLAUDE.md §3.4: cache obrigatório — extrair custa chamada de API por edital,
// nunca reprocessar o mesmo edital.
export enum ExigenciasStatus {
  // IA leu o edital e extraiu as exigências.
  EXTRAIDO = 'extraido',
  // Não há edital completo para ler (só resumo/aviso, sem PDF útil, ~27% — T-47).
  INDISPONIVEL = 'indisponivel',
  // Falha na extração (rede/IA) — re-tentável (não é cache final).
  ERRO = 'erro',
}

// 1:1 com `editais` (UNIQUE edital_id). Tabela separada de propósito: o jsonb das
// exigências e o controle de extração não pesam nas listagens de busca.
@Index('UQ_edital_exigencias_edital', ['editalId'], { unique: true })
@Entity('edital_exigencias')
export class EditalExigencias {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'edital_id' })
  editalId!: string;

  @ManyToOne(() => Edital, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'edital_id' })
  edital?: Edital;

  @Column({ type: 'enum', enum: ExigenciasStatus })
  status!: ExigenciasStatus;

  // Exigências estruturadas (null quando indisponível/erro).
  @Column({ type: 'jsonb', nullable: true })
  exigencias!: ExigenciasHabilitacao | null;

  // Resumo de 1 página gerado pela IA (T-50) — mesma extração/chamada.
  @Column({ type: 'jsonb', nullable: true })
  resumo!: ResumoEdital | null;

  // Modelo de IA usado (auditoria / re-extração se trocar de modelo).
  @Column({ type: 'varchar', length: 100, nullable: true })
  modelo!: string | null;

  // Documento do qual o texto foi extraído (auditoria).
  @Column({
    type: 'varchar',
    length: 255,
    name: 'documento_nome',
    nullable: true,
  })
  documentoNome!: string | null;

  // Sinal de qualidade: quantos trechos citados existem literalmente no edital
  // (verificação anti-alucinação — a T-52 usa para decidir se mostra).
  @Column({ type: 'int', name: 'trechos_ok', nullable: true })
  trechosOk!: number | null;

  @Column({ type: 'int', name: 'trechos_total', nullable: true })
  trechosTotal!: number | null;

  @Column({ type: 'text', nullable: true })
  erro!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
