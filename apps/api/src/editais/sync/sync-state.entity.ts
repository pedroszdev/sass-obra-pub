import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Uf } from '../../common/uf';
import { EditalFonte } from '../edital-fonte.enum';

// Estado de sincronização por fonte + UF. O job (T-18) usa para decidir entre
// backfill e incremental e continuar de onde parou (captação por demanda).
@Index('UQ_sync_states_fonte_uf', ['fonte', 'uf'], { unique: true })
@Entity('sync_states')
export class SyncState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: EditalFonte })
  fonte!: EditalFonte;

  @Column({ type: 'varchar', length: 2 })
  uf!: Uf;

  // Já fez o backfill inicial desta UF?
  @Column({ type: 'boolean', name: 'backfill_done', default: false })
  backfillDone!: boolean;

  // Watermark: editais publicados até esta data já foram captados.
  @Column({ type: 'timestamptz', name: 'synced_until', nullable: true })
  syncedUntil!: Date | null;

  @Column({ type: 'timestamptz', name: 'last_run_at', nullable: true })
  lastRunAt!: Date | null;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError!: string | null;

  @Column({ type: 'timestamptz', name: 'last_error_at', nullable: true })
  lastErrorAt!: Date | null;

  // Contador de falhas seguidas — detecta sync quebrada (T-19).
  @Column({ type: 'int', name: 'consecutive_errors', default: 0 })
  consecutiveErrors!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
