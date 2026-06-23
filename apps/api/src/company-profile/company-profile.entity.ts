import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Uf } from '../common/uf';
import { decimalTransformer } from '../common/decimal.transformer';
import { RegistroProfissionalTipo } from './registro-profissional-tipo.enum';

// Perfil de habilitação da empresa do empreiteiro (BACKLOG T-40), 1:1 com User.
// Guarda os dados escalares de habilitação; certidões e atestados (que são N por
// empresa) ficam em tabelas próprias (Certidao, Atestado). O porte ME/EPP NÃO
// é duplicado aqui — vive em User.porte, usado no filtro de valor (T-21).
// A FK e a unicidade de user_id são criadas na migration.
@Index('UQ_company_profiles_user', ['userId'], { unique: true })
@Entity('company_profiles')
export class CompanyProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'razao_social',
    nullable: true,
  })
  razaoSocial!: string | null;

  // Capital social em reais. numeric(15,2) + transformer (volta number, não string).
  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    name: 'capital_social',
    nullable: true,
    transformer: decimalTransformer,
  })
  capitalSocial!: number | null;

  // Registro no conselho profissional (CREA/CAU) do responsável técnico.
  @Column({
    type: 'enum',
    enum: RegistroProfissionalTipo,
    name: 'registro_profissional_tipo',
    nullable: true,
  })
  registroProfissionalTipo!: RegistroProfissionalTipo | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'registro_profissional_numero',
    nullable: true,
  })
  registroProfissionalNumero!: string | null;

  @Column({
    type: 'varchar',
    length: 2,
    name: 'registro_profissional_uf',
    nullable: true,
  })
  registroProfissionalUf!: Uf | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
