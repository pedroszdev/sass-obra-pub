import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Uf } from '../../common/uf';
import { EditalFonte } from '../edital-fonte.enum';

// Histórico de execuções do job de captação — uma linha por sync de (fonte, UF).
// Permite ver o histórico e detectar falhas (T-19). Diferente do sync_states,
// que guarda só o estado atual.
@Index('IDX_sync_runs_fonte_uf_started', ['fonte', 'uf', 'startedAt'])
@Entity('sync_runs')
export class SyncRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: EditalFonte })
  fonte!: EditalFonte;

  @Column({ type: 'varchar', length: 2 })
  uf!: Uf;

  @Column({ type: 'varchar', length: 20 })
  mode!: string; // 'backfill' | 'incremental'

  @Column({ type: 'varchar', length: 10 })
  status!: string; // 'success' | 'error'

  @Column({ type: 'int', default: 0 })
  processed!: number;

  @Column({ type: 'int', default: 0 })
  created!: number;

  @Column({ type: 'int', default: 0 })
  updated!: number;

  @Column({ type: 'int', default: 0 })
  obras!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', name: 'finished_at' })
  finishedAt!: Date;

  @Column({ type: 'int', name: 'duration_ms' })
  durationMs!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
