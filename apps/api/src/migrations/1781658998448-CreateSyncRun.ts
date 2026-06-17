import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSyncRun1781658998448 implements MigrationInterface {
  name = 'CreateSyncRun1781658998448';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."sync_runs_fonte_enum" AS ENUM('PNCP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sync_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fonte" "public"."sync_runs_fonte_enum" NOT NULL, "uf" character varying(2) NOT NULL, "mode" character varying(20) NOT NULL, "status" character varying(10) NOT NULL, "processed" integer NOT NULL DEFAULT '0', "created" integer NOT NULL DEFAULT '0', "updated" integer NOT NULL DEFAULT '0', "obras" integer NOT NULL DEFAULT '0', "error" text, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "finished_at" TIMESTAMP WITH TIME ZONE NOT NULL, "duration_ms" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_adf13fff41a683b3b991fb90b11" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sync_runs_fonte_uf_started" ON "sync_runs"  ("fonte", "uf", "started_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_sync_runs_fonte_uf_started"`,
    );
    await queryRunner.query(`DROP TABLE "sync_runs"`);
    await queryRunner.query(`DROP TYPE "public"."sync_runs_fonte_enum"`);
  }
}
