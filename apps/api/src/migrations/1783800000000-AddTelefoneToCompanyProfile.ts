import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-99 — telefone de contato da empresa no perfil. Aditiva. À mão.
export class AddTelefoneToCompanyProfile1783800000000 implements MigrationInterface {
  name = 'AddTelefoneToCompanyProfile1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_profiles" ADD "telefone" character varying(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_profiles" DROP COLUMN "telefone"`,
    );
  }
}
