import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUfToUsers1781633870241 implements MigrationInterface {
  name = 'AddUfToUsers1781633870241';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "uf" character varying(2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "uf"`);
  }
}
