import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-89 — preferências de notificação por usuário (jsonb {whatsapp,email}).
// Null = ainda não configurou (a API devolve os defaults). Aditiva. À mão.
export class AddNotificationPrefsToUsers1783500000000 implements MigrationInterface {
  name = 'AddNotificationPrefsToUsers1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "notification_prefs" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "notification_prefs"`,
    );
  }
}
