import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-134 — arquivo (PDF/imagem) da CAT/atestado em bytea. Espelha o
// storage das certidões (T-41b): tabela separada (1:1 com atestados) para o
// conteúdo pesado não pesar nas listagens. À mão (padrão do repo).
export class CreateAtestadoArquivos1783900000000 implements MigrationInterface {
  name = 'CreateAtestadoArquivos1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "atestado_arquivos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "atestado_id" uuid NOT NULL, "nome_arquivo" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "tamanho_bytes" integer NOT NULL, "conteudo" bytea NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_atestado_arquivos" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_atestado_arquivos_atestado" ON "atestado_arquivos" ("atestado_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "atestado_arquivos" ADD CONSTRAINT "FK_atestado_arquivos_atestado" FOREIGN KEY ("atestado_id") REFERENCES "atestados"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "atestado_arquivos" DROP CONSTRAINT "FK_atestado_arquivos_atestado"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_atestado_arquivos_atestado"`,
    );
    await queryRunner.query(`DROP TABLE "atestado_arquivos"`);
  }
}
