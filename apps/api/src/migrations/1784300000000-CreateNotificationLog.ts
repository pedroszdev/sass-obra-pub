import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-103 — log de notificações enviadas (anti-duplicação). À mão.
export class CreateNotificationLog1784300000000 implements MigrationInterface {
  name = 'CreateNotificationLog1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "alerta_id" character varying(200) NOT NULL, "canal" character varying(20) NOT NULL, "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_notification_log" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_notification_log_user_alerta" ON "notification_log" ("user_id", "alerta_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_log_user" ON "notification_log" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_log" ADD CONSTRAINT "FK_notification_log_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_log" DROP CONSTRAINT "FK_notification_log_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_log_user"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_notification_log_user_alerta"`,
    );
    await queryRunner.query(`DROP TABLE "notification_log"`);
  }
}
