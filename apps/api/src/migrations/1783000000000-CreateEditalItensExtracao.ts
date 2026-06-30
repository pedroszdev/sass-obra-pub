import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-64 — cache da extração da planilha de itens por IA de um edital
// (CLAUDE.md §3.4: extrair custa chamada de API por edital, nunca reprocessar).
// 1:1 com editais; espelha edital_exigencias (T-49). Migration à mão (padrão do repo).
export class CreateEditalItensExtracao1783000000000 implements MigrationInterface {
  name = 'CreateEditalItensExtracao1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."edital_itens_extracao_status_enum" AS ENUM('extraido', 'indisponivel', 'erro')`,
    );
    await queryRunner.query(
      `CREATE TABLE "edital_itens_extracao" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "edital_id" uuid NOT NULL, "status" "public"."edital_itens_extracao_status_enum" NOT NULL, "itens" jsonb, "formato" character varying(10), "documento_nome" character varying(255), "modelo" character varying(100), "prompt_tokens" integer, "completion_tokens" integer, "custo_usd" numeric(12,6), "erro" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_edital_itens_extracao" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_edital_itens_extracao_edital" ON "edital_itens_extracao" ("edital_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "edital_itens_extracao" ADD CONSTRAINT "FK_edital_itens_extracao_edital" FOREIGN KEY ("edital_id") REFERENCES "editais"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "edital_itens_extracao" DROP CONSTRAINT "FK_edital_itens_extracao_edital"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_edital_itens_extracao_edital"`,
    );
    await queryRunner.query(`DROP TABLE "edital_itens_extracao"`);
    await queryRunner.query(
      `DROP TYPE "public"."edital_itens_extracao_status_enum"`,
    );
  }
}
