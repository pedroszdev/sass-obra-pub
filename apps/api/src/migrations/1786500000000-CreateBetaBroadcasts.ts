import { MigrationInterface, QueryRunner } from 'typeorm';

// Comunicado ao beta (T-198): registro das campanhas de e-mail segmentado. O
// status por destinatário fica no mail_log (T-193).
export class CreateBetaBroadcasts1786500000000 implements MigrationInterface {
  name = 'CreateBetaBroadcasts1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "beta_broadcasts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "assunto" character varying(200) NOT NULL,
        "corpo" text NOT NULL,
        "segmento" character varying(20) NOT NULL,
        "total" integer NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'enviando',
        "created_by_admin_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_beta_broadcasts" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_beta_broadcasts_created" ON "beta_broadcasts" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_beta_broadcasts_created"`,
    );
    await queryRunner.query(`DROP TABLE "beta_broadcasts"`);
  }
}
