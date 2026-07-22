import { MigrationInterface, QueryRunner } from 'typeorm';

// Curadoria do admin (T-197): flag para despublicar um edital da busca.
export class AddEditalOculto1785800000000 implements MigrationInterface {
  name = 'AddEditalOculto1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "editais" ADD "oculto" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "editais" DROP COLUMN "oculto"`);
  }
}
