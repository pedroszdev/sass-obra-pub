import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CertidaoTipo } from './certidao-tipo.enum';

// Uma certidão de habilitação do empreiteiro (BACKLOG T-40). N por usuário.
// Referencia user_id direto (igual Favorito) — não exige um CompanyProfile já
// criado. A FK (ON DELETE CASCADE) é feita na migration. O campo-chave para o
// alerta de vencimento (T-43) é dataValidade; por isso o índice (user, validade).
@Index('IDX_certidoes_user_validade', ['userId', 'dataValidade'])
@Entity('certidoes')
export class Certidao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'enum', enum: CertidaoTipo })
  tipo!: CertidaoTipo;

  // Detalhe livre — obrigatório na prática quando tipo = OUTRA (validação na T-41).
  @Column({ type: 'varchar', length: 255, nullable: true })
  descricao!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  numero!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'orgao_emissor',
    nullable: true,
  })
  orgaoEmissor!: string | null;

  @Column({ type: 'date', name: 'data_emissao', nullable: true })
  dataEmissao!: string | null;

  @Column({ type: 'date', name: 'data_validade', nullable: true })
  dataValidade!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
