import { MigrationInterface, QueryRunner } from 'typeorm';

// Log de buscas (T-199). Alimenta o painel de "o que buscam / o que dá zero".
export class CreateSearchLog1785500000000 implements MigrationInterface {
  name = 'CreateSearchLog1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "search_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "termo" character varying(200),
        "ufs" text,
        "municipios" text,
        "valor_min" numeric,
        "valor_max" numeric,
        "total" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_search_log" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_search_log_created" ON "search_log" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_search_log_total" ON "search_log" ("total")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_search_log_total"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_search_log_created"`);
    await queryRunner.query(`DROP TABLE "search_log"`);
  }
}
