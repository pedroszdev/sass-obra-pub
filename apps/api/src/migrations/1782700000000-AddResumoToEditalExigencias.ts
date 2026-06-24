import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-50 — resumo de 1 página gerado pela IA, na MESMA extração das
// exigências (T-49). Coluna jsonb separada na tabela de cache existente.
export class AddResumoToEditalExigencias1782700000000 implements MigrationInterface {
  name = 'AddResumoToEditalExigencias1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" ADD "resumo" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" DROP COLUMN "resumo"`,
    );
  }
}
