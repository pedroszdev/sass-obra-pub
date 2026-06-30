import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-90 — marca da última visita à central de alertas. Alertas com data
// posterior contam como "não lidos" no sino. Aditiva. À mão.
export class AddAlertasVistoEmToUsers1783600000000 implements MigrationInterface {
  name = 'AddAlertasVistoEmToUsers1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "alertas_visto_em" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "alertas_visto_em"`,
    );
  }
}
