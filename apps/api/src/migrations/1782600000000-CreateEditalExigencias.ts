import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-49 — cache das exigências de habilitação extraídas por IA de um
// edital (CLAUDE.md §3.4: extrair custa chamada de API por edital, nunca
// reprocessar). Tabela separada (1:1 com editais) para o jsonb não pesar nas
// listagens de busca. Migration escrita à mão (padrão do repo).
export class CreateEditalExigencias1782600000000 implements MigrationInterface {
  name = 'CreateEditalExigencias1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."edital_exigencias_status_enum" AS ENUM('extraido', 'indisponivel', 'erro')`,
    );
    await queryRunner.query(
      `CREATE TABLE "edital_exigencias" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "edital_id" uuid NOT NULL, "status" "public"."edital_exigencias_status_enum" NOT NULL, "exigencias" jsonb, "modelo" character varying(100), "documento_nome" character varying(255), "trechos_ok" integer, "trechos_total" integer, "erro" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_edital_exigencias" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_edital_exigencias_edital" ON "edital_exigencias" ("edital_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" ADD CONSTRAINT "FK_edital_exigencias_edital" FOREIGN KEY ("edital_id") REFERENCES "editais"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" DROP CONSTRAINT "FK_edital_exigencias_edital"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_edital_exigencias_edital"`,
    );
    await queryRunner.query(`DROP TABLE "edital_exigencias"`);
    await queryRunner.query(
      `DROP TYPE "public"."edital_exigencias_status_enum"`,
    );
  }
}
