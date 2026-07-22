import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Nota interna por conta (T-186) — o mini-CRM do beta ("liguei 12/08, pediu
// filtro por região"). Texto livre com data/hora e o admin que escreveu.
@Index('IDX_account_notes_user_created', ['userId', 'createdAt'])
@Entity('account_notes')
export class AccountNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Conta sobre a qual é a nota.
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  // Admin que escreveu a nota.
  @Column({ type: 'uuid', name: 'autor_id' })
  autorId!: string;

  @Column({ type: 'text' })
  texto!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
