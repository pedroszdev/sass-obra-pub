import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';

// Registro de notificação já enviada (BACKLOG T-103) — anti-duplicação. Uma
// linha por (usuário, alertaId): se já existe, não reenvia. O `alertaId` é a
// chave ESTÁVEL do alerta (ex.: "documento:TRABALHISTA:2026-07-10"), então uma
// certidão vencendo não vira um e-mail por dia. FK CASCADE na migration.
@Unique('UQ_notification_log_user_alerta', ['userId', 'alertaId'])
@Entity('notification_log')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 200, name: 'alerta_id' })
  alertaId!: string;

  @Column({ type: 'varchar', length: 20 })
  canal!: string; // 'email' (whatsapp fica para quando houver provedor)

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt!: Date;
}
