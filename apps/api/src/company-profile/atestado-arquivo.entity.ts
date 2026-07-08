import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Arquivo (PDF/imagem) da CAT/atestado de capacidade técnica (BACKLOG T-134).
// Espelha CertidaoArquivo (T-41b): tabela SEPARADA de `atestados` de propósito —
// o `conteudo` (bytea) é pesado e NUNCA deve ser carregado nas listagens, só no
// download. 1:1 com o atestado (UNIQUE atestado_id; re-upload substitui). A FK
// ON DELETE CASCADE é feita na migration.
@Index('UQ_atestado_arquivos_atestado', ['atestadoId'], { unique: true })
@Entity('atestado_arquivos')
export class AtestadoArquivo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'atestado_id' })
  atestadoId!: string;

  @Column({ type: 'varchar', length: 255, name: 'nome_arquivo' })
  nomeArquivo!: string;

  @Column({ type: 'varchar', length: 100, name: 'mime_type' })
  mimeType!: string;

  @Column({ type: 'int', name: 'tamanho_bytes' })
  tamanhoBytes!: number;

  // Bytes do arquivo. Só selecionado no download (ver CompanyProfileService).
  @Column({ type: 'bytea' })
  conteudo!: Buffer;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
