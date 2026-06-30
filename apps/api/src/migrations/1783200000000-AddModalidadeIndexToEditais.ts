import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-80 — índice para o filtro por modalidade. A busca já recorta por
// isObra + uf; o índice em modalidade_id ajuda o IN da modalidade. Aditivo e
// idempotente (IF NOT EXISTS). Migration à mão (padrão do repo) — evita o
// papercut do migration:generate que recria o DROP do índice GIN (§10.1).
export class AddModalidadeIndexToEditais1783200000000 implements MigrationInterface {
  name = 'AddModalidadeIndexToEditais1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_editais_modalidade" ON "editais" ("modalidade_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_editais_modalidade"`);
  }
}
