import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Estado da solicitação. `pendente` é o único que exige ação do dono. */
export type RefundStatus = 'pendente' | 'aprovada' | 'recusada';

/**
 * Solicitação de reembolso (T-218).
 *
 * 🔴 **Por que existe uma tabela, e não só uma chamada ao provedor:** a decisão
 * é do dono (04/08 — toda solicitação passa por ele), então precisa haver um
 * lugar onde o pedido ESPERA. Sem isso o cliente não teria como registrar que
 * pediu, e o dono não teria fila para trabalhar.
 *
 * ⚠️ O corte de acesso NÃO acontece aqui. Ele já existe desde a T-157 e é
 * disparado pelo WEBHOOK `PAYMENT_REFUNDED` — ou seja, só depois de o dinheiro
 * de fato voltar. Marcar o acesso como revogado na aprovação seria cortar antes
 * de devolver, que é o pior dos dois mundos para o cliente.
 */
@Entity('refund_requests')
export class RefundRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Uma conta pode pedir mais de uma vez ao longo da vida (ciclos diferentes),
  // por isso não é único — o índice serve à listagem do /admin e à checagem de
  // pedido pendente.
  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  /** Cobrança no provedor que será estornada. */
  @Column({ type: 'varchar', length: 255, name: 'payment_id' })
  paymentId!: string;

  /** Valor da cobrança em CENTAVOS, congelado no pedido. */
  @Column({ type: 'int', name: 'valor_centavos' })
  valorCentavos!: number;

  /**
   * Estava dentro dos 7 dias do CDC QUANDO PEDIU.
   *
   * ⚠️ Congelado de propósito. O prazo corre; se o dono levar dois dias para
   * decidir, recalcular na aprovação transformaria um pedido legítimo em fora
   * do prazo — punindo o cliente pela nossa demora.
   */
  @Column({ type: 'boolean', name: 'dentro_do_prazo' })
  dentroDoPrazo!: boolean;

  @Column({ type: 'text', nullable: true })
  motivo!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pendente' })
  status!: RefundStatus;

  @CreateDateColumn({ name: 'solicitado_em', type: 'timestamptz' })
  solicitadoEm!: Date;

  @Column({ type: 'timestamptz', name: 'decidido_em', nullable: true })
  decididoEm!: Date | null;

  /** Admin que decidiu — auditoria de quem mexeu no dinheiro de quem. */
  @Column({ type: 'uuid', name: 'decidido_por', nullable: true })
  decididoPor!: string | null;

  /** Recusa exige justificativa; ela volta para o cliente. */
  @Column({ type: 'text', name: 'nota_decisao', nullable: true })
  notaDecisao!: string | null;
}
