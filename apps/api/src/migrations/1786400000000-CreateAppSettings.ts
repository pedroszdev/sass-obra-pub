import { MigrationInterface, QueryRunner } from 'typeorm';

// Store de configuração operacional em runtime (T-195): banner global de aviso +
// dias de trial editáveis, sem deploy/SQL. Chave-valor genérico.
export class CreateAppSettings1786400000000 implements MigrationInterface {
  name = 'CreateAppSettings1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "app_settings" (
        "key" character varying(64) NOT NULL,
        "value" jsonb NOT NULL,
        "updated_by_admin_id" uuid,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_settings" PRIMARY KEY ("key")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_settings"`);
  }
}
