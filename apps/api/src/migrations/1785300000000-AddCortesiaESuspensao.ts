import { MigrationInterface, QueryRunner } from 'typeorm';

// Concessões manuais do admin na assinatura (T-185): cortesia (bypass de paywall
// sem cartão, com validade) e suspensão (bloqueio). Ambas alimentam
// calcularAcesso e ficam FORA do montarPatch da Stripe (fato local).
export class AddCortesiaESuspensao1785300000000 implements MigrationInterface {
  name = 'AddCortesiaESuspensao1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "cortesia_ate" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "suspenso_em" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN "suspenso_em"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN "cortesia_ate"`,
    );
  }
}
