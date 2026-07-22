import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../common/decimal.transformer';
import { Uf } from '../common/uf';
import { EditalFonte } from './edital-fonte.enum';

// Formato interno padronizado de um edital. O resto do sistema só conhece
// estas colunas — nunca o formato específico de uma fonte (CLAUDE.md §3.1).
@Index('UQ_editais_fonte_id_externo', ['fonte', 'idExterno'], { unique: true })
// Índice da busca mais comum: obras de uma UF, mais recentes primeiro.
@Index('IDX_editais_uf_is_obra_data', ['uf', 'isObra', 'dataPublicacao'])
@Entity('editais')
export class Edital {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: EditalFonte })
  fonte!: EditalFonte;

  // `fonte` + `idExterno` é a chave de deduplicação/upsert (CLAUDE.md §3.2).
  @Column({ type: 'varchar', length: 100, name: 'id_externo' })
  idExterno!: string;

  @Column({ type: 'varchar', length: 255, name: 'orgao_nome' })
  orgaoNome!: string;

  @Column({ type: 'varchar', length: 14, name: 'orgao_cnpj', nullable: true })
  orgaoCnpj!: string | null;

  @Column({ type: 'varchar', length: 2 })
  uf!: Uf;

  @Column({ type: 'varchar', length: 255, name: 'municipio_nome' })
  municipioNome!: string;

  @Index('IDX_editais_codigo_ibge')
  @Column({ type: 'varchar', length: 7, name: 'codigo_ibge', nullable: true })
  codigoIbge!: string | null;

  @Column({ type: 'text' })
  objeto!: string;

  @Column({ type: 'int', name: 'modalidade_id' })
  modalidadeId!: number;

  @Column({ type: 'varchar', length: 100, name: 'modalidade_nome' })
  modalidadeNome!: string;

  @Index('IDX_editais_valor_estimado')
  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    name: 'valor_estimado',
    nullable: true,
    transformer: decimalTransformer,
  })
  valorEstimado!: number | null;

  @Index('IDX_editais_data_publicacao')
  @Column({ type: 'timestamptz', name: 'data_publicacao' })
  dataPublicacao!: Date;

  @Column({ type: 'timestamptz', name: 'prazo_proposta', nullable: true })
  prazoProposta!: Date | null;

  @Column({ type: 'text', name: 'link_origem', nullable: true })
  linkOrigem!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  situacao!: string | null;

  // Classificação de obra (catálogo da T-09, aplicado na ingestão T-15).
  // Guardamos também os não-obra, marcados (CLAUDE.md §3.3).
  @Column({ type: 'boolean', name: 'is_obra', default: false })
  isObra!: boolean;

  // Curadoria do admin (T-197): edital despublicado some da BUSCA (buildEditalWhere
  // exclui oculto=true), mas o detalhe por id ainda abre (igual ao favorito morto).
  @Column({ type: 'boolean', default: false })
  oculto!: boolean;

  // Coluna gerada para busca textual (full-text PT). O índice GIN é criado
  // na migration via SQL cru — o decorator @Index não expressa GIN.
  @Column({
    type: 'tsvector',
    name: 'objeto_busca',
    generatedType: 'STORED',
    asExpression: "to_tsvector('portuguese', coalesce(objeto, ''))",
    select: false,
    nullable: true,
  })
  objetoBusca?: string;

  // Registro cru da fonte — permite reprocessar/usar campos novos sem re-baixar.
  // NULL depois que a retenção (T-154) o descarta: é uso interno e o maior peso
  // por linha, então some quando o edital encerra. NULL = "não guardamos mais o
  // dump", não "nunca teve".
  @Column({ type: 'jsonb', name: 'raw_payload', nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
