import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Marca que a NFS-e de uma cobrança **já foi emitida à mão** (T-219).
 *
 * 🔴 **Por que uma tabela aqui, se a do reembolso foi apagada?** Porque o fato é
 * de natureza diferente. No reembolso, quem sabia se a devolução aconteceu era o
 * PROVEDOR — guardar no nosso banco criaria uma segunda verdade que
 * dessincroniza. Aqui o fato é *"eu emiti a nota fora do sistema"*, e ele **não
 * existe em provedor nenhum**: só na cabeça do dono. Sem registrá-lo, não há
 * como saber.
 *
 * ⚠️ E sem isso o alerta se autodestrói: ele repetiria a cada rodada sobre a
 * mesma cobrança, e alerta que repete deixa de ser lido — que é exatamente o
 * fracasso que o §8 descreve ("painel que exige olhar não protege").
 *
 * ⚠️ A PK é o id da cobrança NO PROVEDOR, não um uuid nosso: marcar duas vezes é
 * no-op, e é o id que aparece nos dois lados quando alguém for conferir.
 */
@Entity('nfse_emitidas')
export class NfseEmitida {
  @PrimaryColumn({ type: 'varchar', length: 255, name: 'payment_id' })
  paymentId!: string;

  @Column({ type: 'timestamptz', name: 'emitida_em' })
  emitidaEm!: Date;

  /** Admin que marcou — auditoria de quem declarou o quê. */
  @Column({ type: 'uuid', name: 'emitida_por' })
  emitidaPor!: string;

  /** Número da nota, se o dono quiser anotar. Facilita conferência depois. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  numero!: string | null;
}
