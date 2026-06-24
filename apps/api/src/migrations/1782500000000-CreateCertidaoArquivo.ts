import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-41b — arquivo (PDF/imagem) das certidões guardado em bytea no
// Postgres. Tabela separada (1:1 com certidoes) para o conteúdo pesado não
// pesar nas listagens. Migration escrita à mão (padrão do repo).
export class CreateCertidaoArquivo1782500000000 implements MigrationInterface {
  name = 'CreateCertidaoArquivo1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "certidao_arquivos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "certidao_id" uuid NOT NULL, "nome_arquivo" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "tamanho_bytes" integer NOT NULL, "conteudo" bytea NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_certidao_arquivos" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_certidao_arquivos_certidao" ON "certidao_arquivos" ("certidao_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "certidao_arquivos" ADD CONSTRAINT "FK_certidao_arquivos_certidao" FOREIGN KEY ("certidao_id") REFERENCES "certidoes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "certidao_arquivos" DROP CONSTRAINT "FK_certidao_arquivos_certidao"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_certidao_arquivos_certidao"`,
    );
    await queryRunner.query(`DROP TABLE "certidao_arquivos"`);
  }
}
