import { MigrationInterface, QueryRunner } from 'typeorm';

// Cooldown dos alertas de pipeline quebrado (T-189). Chave = tipo do alerta.
export class CreatePipelineAlertState1785400000000 implements MigrationInterface {
  name = 'CreatePipelineAlertState1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pipeline_alert_state" (
        "tipo" character varying(40) NOT NULL,
        "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_pipeline_alert_state" PRIMARY KEY ("tipo")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pipeline_alert_state"`);
  }
}
