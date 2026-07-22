import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Registro de cada busca de editais (T-199). O sinal mais rico de um produto de
// captação: a busca que volta VAZIA (total=0) diz exatamente qual região o
// cliente quer e não temos — buraco de cobertura ou obra que o "favor recall"
// deixou de fora. Sem isso, o empreiteiro busca a região dele, não acha nada e
// desiste EM SILÊNCIO.
//
// LGPD (T-102): guardamos o mínimo — os filtros, o total e o userId (para o dono
// poder ligar para quem ficou sem resultado, decisão do dono). Nada além disso.
@Index('IDX_search_log_created', ['createdAt'])
@Index('IDX_search_log_total', ['total'])
@Entity('search_log')
export class SearchLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  // Termo de busca (o `q`), truncado. Null quando a busca foi só por filtros.
  @Column({ type: 'varchar', length: 200, nullable: true })
  termo!: string | null;

  // UFs e municípios (códigos IBGE) do filtro — simple-array (texto separado por
  // vírgula). Vazio = sem filtro daquele tipo.
  @Column({ type: 'simple-array', nullable: true })
  ufs!: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  municipios!: string[] | null;

  @Column({ type: 'numeric', name: 'valor_min', nullable: true })
  valorMin!: number | null;

  @Column({ type: 'numeric', name: 'valor_max', nullable: true })
  valorMax!: number | null;

  // Quantos editais a busca retornou. 0 = o sinal de ouro (região sem cobertura).
  @Column({ type: 'int' })
  total!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
