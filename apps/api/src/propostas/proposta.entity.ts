import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../common/decimal.transformer';
import { EtapaCronograma } from './cronograma';
import { PropostaItem } from './proposta-item.entity';
import { PropostaStatus } from './proposta-status.enum';

// Proposta de preço do empreiteiro para um edital específico (BACKLOG T-60).
// É o orçamento que nasce do edital já captado/lido por IA (diferencial do
// Épico 6). N por user e N por edital (rascunhos) — sem UNIQUE(user, edital).
// As FKs (users e editais, ON DELETE CASCADE) são criadas na migration.
//
// Guarda apenas as ENTRADAS do cálculo (BDI e teto de referência); os totais
// (custo direto, valor com BDI, valor global) NÃO são persistidos — o motor de
// cálculo (T-66) os deriva como função pura. CLAUDE.md §3.3: backend é dono do
// cálculo, e persistir um total derivado arriscaria divergir de qtd × preço.
@Index('IDX_propostas_user_created', ['userId', 'createdAt'])
@Entity('propostas')
export class Proposta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'edital_id' })
  editalId!: string;

  @Column({ type: 'varchar', length: 255 })
  titulo!: string;

  @Column({
    type: 'enum',
    enum: PropostaStatus,
    default: PropostaStatus.RASCUNHO,
  })
  status!: PropostaStatus;

  // BDI em pontos percentuais (ex.: 25.50 = 25,5%). Entrada do cálculo (T-67),
  // aplicado sobre o custo direto. numeric(5,2) cabe até 999,99%.
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    name: 'bdi_percentual',
    nullable: true,
    transformer: decimalTransformer,
  })
  bdiPercentual!: number | null;

  // Valor de referência (teto) do edital, em reais. Snapshot — a comparação com
  // a proposta (T-69) usa este valor; refinável por IA/PNCP depois.
  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    name: 'valor_referencia',
    nullable: true,
    transformer: decimalTransformer,
  })
  valorReferencia!: number | null;

  // Cronograma físico-financeiro simples (T-93): etapas {descrição, percentual}.
  // Só as ENTRADAS — o valor por etapa é derivado do valor global (§3.3).
  @Column({ type: 'jsonb', nullable: true })
  cronograma!: EtapaCronograma[] | null;

  // Data de envio ao certame (T-84). Derivada da transição de status (set ao
  // sair de rascunho, limpa ao voltar) — o front não a envia (§3.3).
  @Column({ type: 'timestamptz', name: 'data_envio', nullable: true })
  dataEnvio!: Date | null;

  @OneToMany(() => PropostaItem, (item) => item.proposta)
  itens?: PropostaItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
