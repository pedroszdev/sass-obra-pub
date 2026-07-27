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
// em silêncio). O status de ENTREGA (entregue/bounce) chega DEPOIS, pelo webhook
// do Resend, e é gravado nos campos `delivery_*` — correlacionado por
// `provider_message_id` (o id que o Resend devolve no POST de envio).
@Index('IDX_mail_log_para_created', ['para', 'createdAt'])
@Index('IDX_mail_log_status', ['status'])
@Index('IDX_mail_log_provider_msg', ['providerMessageId'])
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

  // Id do provedor (o `id` que o Resend devolve no envio). É a chave para casar o
  // webhook de entrega/bounce com esta linha. Só o caminho Resend preenche.
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'provider_message_id',
  })
  providerMessageId!: string | null;

  // Status de ENTREGA, vindo do webhook (T-193): 'entregue' | 'bounce' |
  // 'reclamacao' | 'atrasado'. Null = ainda sem sinal de entrega.
  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'delivery_status',
  })
  deliveryStatus!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'delivery_at' })
  deliveryAt!: Date | null;

  // Detalhe do evento de entrega (ex.: motivo do bounce), quando o Resend informa.
  @Column({ type: 'text', nullable: true, name: 'delivery_detalhe' })
  deliveryDetalhe!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
