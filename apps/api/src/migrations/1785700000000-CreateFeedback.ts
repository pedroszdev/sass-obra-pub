import { MigrationInterface, QueryRunner } from 'typeorm';

// Fila de feedback/bug in-app (T-202).
export class CreateFeedback1785700000000 implements MigrationInterface {
  name = 'CreateFeedback1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "feedback" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "rota" character varying(255),
        "versao" character varying(40),
        "mensagem" text NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'novo',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_feedback" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_feedback_status_created" ON "feedback" ("status", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_feedback_status_created"`,
    );
    await queryRunner.query(`DROP TABLE "feedback"`);
  }
}
