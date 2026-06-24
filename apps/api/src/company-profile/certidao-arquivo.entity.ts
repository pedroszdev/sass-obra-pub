import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Arquivo (PDF/imagem) anexado a uma certidão (BACKLOG T-41b). Tabela SEPARADA
// de certidoes de propósito: o `conteudo` (bytea) é pesado e NUNCA deve ser
// carregado nas listagens — só no download. 1:1 com a certidão (UNIQUE
// certidao_id; re-upload substitui). A FK ON DELETE CASCADE é feita na migration.
@Index('UQ_certidao_arquivos_certidao', ['certidaoId'], { unique: true })
@Entity('certidao_arquivos')
export class CertidaoArquivo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'certidao_id' })
  certidaoId!: string;

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
