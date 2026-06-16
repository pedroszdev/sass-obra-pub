import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSyncState1781650107709 implements MigrationInterface {
  name = 'CreateSyncState1781650107709';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."sync_states_fonte_enum" AS ENUM('PNCP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sync_states" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fonte" "public"."sync_states_fonte_enum" NOT NULL, "uf" character varying(2) NOT NULL, "backfill_done" boolean NOT NULL DEFAULT false, "synced_until" TIMESTAMP WITH TIME ZONE, "last_run_at" TIMESTAMP WITH TIME ZONE, "last_error" text, "last_error_at" TIMESTAMP WITH TIME ZONE, "consecutive_errors" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_805def8a22b06b98ed3ab32db31" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_sync_states_fonte_uf" ON "sync_states"  ("fonte", "uf") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_sync_states_fonte_uf"`);
    await queryRunner.query(`DROP TABLE "sync_states"`);
    await queryRunner.query(`DROP TYPE "public"."sync_states_fonte_enum"`);
  }
}
