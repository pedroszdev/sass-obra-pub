import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const LGPD_TIPOS = [
  'acesso',
  'exportacao',
  'exclusao',
  'correcao',
  'outro',
] as const;
export type LgpdTipo = (typeof LGPD_TIPOS)[number];

export const LGPD_STATUS = [
  'aberta',
  'em_andamento',
  'atendida',
  'recusada',
] as const;
export type LgpdStatus = (typeof LGPD_STATUS)[number];

// Fila de solicitações de titular (T-196). A LGPD dá ao titular o direito de
// pedir acesso/exportação/correção/exclusão dos dados, COM prazo de resposta. O
// self-service (T-102) cobre o titular logado; esta fila é para o pedido que
// chega POR E-MAIL, fora do app — sem ela, o pedido se perde e não há registro
// do atendimento (a prova de conformidade do dono).
@Index('IDX_lgpd_requests_status_prazo', ['status', 'prazo'])
@Entity('lgpd_requests')
export class LgpdRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: LgpdTipo;

  @Column({ type: 'varchar', length: 20, default: 'aberta' })
  status!: LgpdStatus;

  // E-mail de quem pediu — pode ser externo e não bater com nenhuma conta.
  @Column({ type: 'varchar', length: 255, name: 'requester_email' })
  requesterEmail!: string;

  // Conta ligada, quando identificada. SEM FK de propósito: o registro de um
  // pedido de EXCLUSÃO precisa sobreviver à exclusão da conta (é a prova de que
  // foi atendido) — igual ao admin_audit_log. Uma FK com cascade apagaria a prova.
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;

  // Registro do atendimento (ou da recusa) — como o pedido foi resolvido.
  @Column({ type: 'text', nullable: true })
  resolucao!: string | null;

  // Prazo de resposta, fixado na criação (createdAt + 15 dias, art. 19 LGPD).
  @Column({ type: 'timestamptz' })
  prazo!: Date;

  @Column({ type: 'timestamptz', name: 'atendida_em', nullable: true })
  atendidaEm!: Date | null;

  // Admin que registrou a solicitação.
  @Column({ type: 'uuid', name: 'created_by_admin_id' })
  createdByAdminId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
