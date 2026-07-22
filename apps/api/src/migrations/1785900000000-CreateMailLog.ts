import { MigrationInterface, QueryRunner } from 'typeorm';

// Log de e-mails transacionais (T-193).
export class CreateMailLog1785900000000 implements MigrationInterface {
  name = 'CreateMailLog1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mail_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "para" character varying(255) NOT NULL,
        "assunto" character varying(255) NOT NULL,
        "provedor" character varying(20) NOT NULL,
        "status" character varying(20) NOT NULL,
        "erro" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mail_log" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mail_log_para_created" ON "mail_log" ("para", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mail_log_status" ON "mail_log" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_mail_log_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_mail_log_para_created"`);
    await queryRunner.query(`DROP TABLE "mail_log"`);
  }
}
