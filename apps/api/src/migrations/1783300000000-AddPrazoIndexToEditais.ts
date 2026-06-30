import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-81 — índice em prazo_proposta para a ordenação "prazo mais próximo".
// valorEstimado e dataPublicacao já têm índice; faltava o prazo. Aditivo e
// idempotente (IF NOT EXISTS). Migration à mão (padrão do repo) — evita o
// papercut do migration:generate que recria o DROP do índice GIN (§10.1).
export class AddPrazoIndexToEditais1783300000000 implements MigrationInterface {
  name = 'AddPrazoIndexToEditais1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_editais_prazo_proposta" ON "editais" ("prazo_proposta")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_editais_prazo_proposta"`,
    );
  }
}
