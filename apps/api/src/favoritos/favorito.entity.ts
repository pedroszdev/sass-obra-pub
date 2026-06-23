import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

// Edital salvo por um usuário (T-31). Join user × edital. As FKs (ON DELETE
// CASCADE para users e editais) e a unicidade são criadas na migration — aqui
// ficam apenas as colunas escalares; a listagem carrega o edital por id.
@Unique('UQ_favoritos_user_edital', ['userId', 'editalId'])
@Index('IDX_favoritos_user_created', ['userId', 'createdAt'])
@Entity('favoritos')
export class Favorito {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'edital_id' })
  editalId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
