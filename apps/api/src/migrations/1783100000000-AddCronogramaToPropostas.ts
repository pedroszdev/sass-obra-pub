import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-93 — cronograma físico-financeiro simples da proposta (jsonb com as
// etapas {descrição, percentual}; o valor por etapa é derivado, §3.3). Aditiva e
// idempotente-friendly. Migration à mão (padrão do repo).
export class AddCronogramaToPropostas1783100000000 implements MigrationInterface {
  name = 'AddCronogramaToPropostas1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "propostas" ADD "cronograma" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "propostas" DROP COLUMN "cronograma"`);
  }
}
