import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Uf } from '../common/uf';
import { CompanyPorte } from './company-porte.enum';
import { UserRole } from './user-role.enum';

// Preferências de notificação (T-89). Push fica de fora por ora (não implementado
// — a UI mostra "em breve"). Canais que avisam obra/prazo/certidão/resultado.
export interface NotificationPrefs {
  whatsapp: boolean;
  email: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  whatsapp: true,
  email: true,
};

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

  // UF de atuação do empreiteiro — alvo da captação orientada à demanda (T-18).
  // Nullable no banco (usuários anteriores ao campo); obrigatória no cadastro.
  @Column({ type: 'varchar', length: 2, nullable: true })
  uf!: Uf | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  // Preferências de notificação (T-89). Null = ainda não configurou → defaults.
  @Column({ type: 'jsonb', name: 'notification_prefs', nullable: true })
  notificationPrefs!: NotificationPrefs | null;

  // Última visita à central de alertas (T-90). Alertas com data posterior contam
  // como "não lidos" no sino. Null = nunca abriu (tudo conta como novo).
  @Column({ type: 'timestamptz', name: 'alertas_visto_em', nullable: true })
  alertasVistoEm!: Date | null;

  // Aceite dos Termos + Política de Privacidade no cadastro (T-102/LGPD). Null =
  // conta anterior ao consentimento (grandfathered).
  @Column({ type: 'timestamptz', name: 'terms_accepted_at', nullable: true })
  termsAcceptedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
