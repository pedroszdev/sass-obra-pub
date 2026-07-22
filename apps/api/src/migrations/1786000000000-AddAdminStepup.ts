import { MigrationInterface, QueryRunner } from 'typeorm';

// Step-up do admin (T-183): timestamp até quando as ações sensíveis do backoffice
// estão destravadas (senha reconfirmada há pouco).
export class AddAdminStepup1786000000000 implements MigrationInterface {
  name = 'AddAdminStepup1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "admin_stepup_ate" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "admin_stepup_ate"`,
    );
  }
}
