import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Log de e-mails transacionais (T-193). Registra cada TENTATIVA de envio com o
// resultado no nível do ENVIO (enviado/falhou/log) — isso já pega o problema que
// ficou dias invisível na T-106 (SMTP bloqueado no Render free: o envio falhava
// em silêncio). Status de ENTREGA (entregue/bounce) exigiria webhook do Resend —
// fica para depois.
@Index('IDX_mail_log_para_created', ['para', 'createdAt'])
@Index('IDX_mail_log_status', ['status'])
@Entity('mail_log')
export class MailLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Destinatário (e-mail). O admin filtra por ele; a atribuição à conta é por
  // e-mail (não guardamos userId aqui — o MailService só conhece o `to`).
  @Column({ type: 'varchar', length: 255 })
  para!: string;

  @Column({ type: 'varchar', length: 255 })
  assunto!: string;

  // 'resend' | 'smtp' | 'log'.
  @Column({ type: 'varchar', length: 20 })
  provedor!: string;

  // 'enviado' | 'falhou' | 'log'.
  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  erro!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
