import { MigrationInterface, QueryRunner } from 'typeorm';

// Status de entrega/bounce no log de e-mails (T-193). Os eventos chegam pelo
// webhook do Resend e são casados à linha de envio pelo `provider_message_id`.
export class AddMailDelivery1786700000000 implements MigrationInterface {
  name = 'AddMailDelivery1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mail_log"
        ADD COLUMN "provider_message_id" character varying(255),
        ADD COLUMN "delivery_status" character varying(20),
        ADD COLUMN "delivery_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "delivery_detalhe" text`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mail_log_provider_msg" ON "mail_log" ("provider_message_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_mail_log_provider_msg"`);
    await queryRunner.query(
      `ALTER TABLE "mail_log"
        DROP COLUMN "delivery_detalhe",
        DROP COLUMN "delivery_at",
        DROP COLUMN "delivery_status",
        DROP COLUMN "provider_message_id"`,
    );
  }
}
