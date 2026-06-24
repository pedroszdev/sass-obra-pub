import { MigrationInterface, QueryRunner } from 'typeorm';

// Auditoria de custo da IA por edital: tokens + custo estimado (USD) da extração
// (T-49/T-50). Visível no app, não só no dashboard da OpenAI.
export class AddCustoToEditalExigencias1782800000000 implements MigrationInterface {
  name = 'AddCustoToEditalExigencias1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" ADD "prompt_tokens" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" ADD "completion_tokens" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" ADD "custo_usd" numeric(12,6)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" DROP COLUMN "custo_usd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" DROP COLUMN "completion_tokens"`,
    );
    await queryRunner.query(
      `ALTER TABLE "edital_exigencias" DROP COLUMN "prompt_tokens"`,
    );
  }
}
