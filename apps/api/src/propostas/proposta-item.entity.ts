import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../common/decimal.transformer';
import { Proposta } from './proposta.entity';

// Item da planilha de preços de uma proposta (BACKLOG T-60). N por proposta,
// ordenável (campo `ordem`). Os itens chegam da planilha do edital extraída por
// IA (T-64) ou são adicionados à mão (T-65); o preço unitário é preenchido pelo
// empreiteiro (T-68). O subtotal (qtd × preço) NÃO é persistido — é derivado
// pelo motor de cálculo (T-66), evitando divergir do dado de entrada.
// A FK para `propostas` (ON DELETE CASCADE) é criada na migration.
@Index('IDX_proposta_itens_proposta_ordem', ['propostaId', 'ordem'])
@Entity('proposta_itens')
export class PropostaItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'proposta_id' })
  propostaId!: string;

  @ManyToOne(() => Proposta, (proposta) => proposta.itens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'proposta_id' })
  proposta?: Proposta;

  @Column({ type: 'text' })
  descricao!: string;

  // Unidade de medida do item (ex.: m², m³, kg, vb).
  @Column({ type: 'varchar', length: 20, nullable: true })
  unidade!: string | null;

  // Quantitativo do item. numeric(15,4) aceita frações/coeficientes de obra.
  @Column({
    type: 'numeric',
    precision: 15,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  quantidade!: number | null;

  // Preço unitário em reais. Null até o empreiteiro preencher (T-68).
  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    name: 'preco_unitario',
    nullable: true,
    transformer: decimalTransformer,
  })
  precoUnitario!: number | null;

  // Posição do item dentro da proposta (ordenação estável).
  @Column({ type: 'int', default: 0 })
  ordem!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
