import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Store de configuração operacional em runtime (T-195). Chave-valor genérico:
// uma linha por parâmetro (`value` em jsonb), para crescer sem migration nova.
// Estreia com o banner global de aviso e os dias de trial (ver ConfigStoreService).
@Entity('app_settings')
export class AppSetting {
  // A chave é o identificador do parâmetro (ex.: 'operational_banner').
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;

  // Admin que gravou por último (auditoria fina; a trilha oficial é o audit log).
  @Column({ type: 'uuid', name: 'updated_by_admin_id', nullable: true })
  updatedByAdminId!: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
