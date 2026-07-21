import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Trilha de auditoria do backoffice (BACKLOG T-182). Toda mutação em /admin/* e
// todo acesso a detalhe de conta gravam uma linha aqui.
//
// ⚠️ SEM FK para users em `admin_user_id`: o log tem que SOBREVIVER mesmo que a
// conta admin seja apagada — auditoria que some com o autor não serve de defesa.
// Por isso é um uuid solto (indexado), não uma relação com ON DELETE CASCADE.
@Entity('admin_audit_log')
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'admin_user_id' })
  adminUserId!: string;

  // Rótulo da ação: explícito via @Audit('trial.extend') ou derivado de
  // `${método} ${rota}` quando não anotado.
  @Index()
  @Column({ type: 'varchar', length: 120 })
  action!: string;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ type: 'varchar', length: 255 })
  path!: string;

  // O `:id` alvo da ação (conta/edital/assinatura), quando a rota tem um.
  @Column({ type: 'varchar', length: 64, name: 'target_id', nullable: true })
  targetId!: string | null;

  @Column({ type: 'int', name: 'status_code' })
  statusCode!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  // Resumo REDIGIDO do body (chaves sensíveis viram [redigido], valores
  // truncados). Nunca o body cru — auditar quem fez o quê, não espelhar PII.
  @Column({ type: 'jsonb', nullable: true })
  summary!: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
