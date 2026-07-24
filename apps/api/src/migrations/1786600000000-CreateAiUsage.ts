import { MigrationInterface, QueryRunner } from 'typeorm';

// Registro de uso de IA por chamada (T-190a). O custo já gravado vive na linha
// de CACHE (1 por edital), de onde não sai custo por conta nem hit rate. Esta
// tabela é append-only e responde as duas.
//
// Sem FK para "users" nem para "editais" de propósito: é registro contábil e
// precisa sobreviver à exclusão da conta (LGPD) e à retenção de editais (T-154).
export class CreateAiUsage1786600000000 implements MigrationInterface {
  name = 'CreateAiUsage1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ai_usage" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "feature" character varying(20) NOT NULL,
        "origem" character varying(20) NOT NULL,
        "user_id" uuid,
        "edital_id" uuid,
        "cache_hit" boolean NOT NULL DEFAULT false,
        "modelo" character varying(100),
        "prompt_tokens" integer NOT NULL DEFAULT 0,
        "completion_tokens" integer NOT NULL DEFAULT 0,
        "custo_usd" numeric(10,6) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_usage" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_usage_created" ON "ai_usage" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_usage_user" ON "ai_usage" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_usage_feature" ON "ai_usage" ("feature")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_ai_usage_feature"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ai_usage_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ai_usage_created"`);
    await queryRunner.query(`DROP TABLE "ai_usage"`);
  }
}
