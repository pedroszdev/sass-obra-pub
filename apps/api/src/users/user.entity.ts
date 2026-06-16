import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyPorte } from './company-porte.enum';
import { UserRole } from './user-role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  // Hash bcrypt da senha — nunca exposto nas respostas (ver toUserResponse).
  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  // CNPJ só com dígitos (14). Opcional no cadastro; único quando presente
  // (Postgres permite múltiplos NULL num índice único).
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 14, nullable: true })
  cnpj!: string | null;

  @Column({ type: 'enum', enum: CompanyPorte, nullable: true })
  porte!: CompanyPorte | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
