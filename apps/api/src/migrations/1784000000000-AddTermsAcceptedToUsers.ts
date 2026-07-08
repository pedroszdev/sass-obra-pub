import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-102/LGPD — registra o aceite dos Termos + Privacidade no cadastro.
// Aditiva. À mão.
export class AddTermsAcceptedToUsers1784000000000 implements MigrationInterface {
  name = 'AddTermsAcceptedToUsers1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "terms_accepted_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "terms_accepted_at"`,
    );
  }
}
