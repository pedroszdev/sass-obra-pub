import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-84 — ciclo de status da proposta (rascunho → enviada → ganhou |
// nao_ganhou) + data de envio. Recria o enum PG (não dá pra só remover valor de
// um enum existente): renomeia o antigo, cria o novo, converte a coluna mapeando
// `finalizada → enviada`, e dropa o antigo. Adiciona `data_envio` e faz backfill
// (toda proposta já "enviada" ganha dataEnvio = updated_at). Migration à mão.
export class PropostaStatusCiclo1783400000000 implements MigrationInterface {
  name = 'PropostaStatusCiclo1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) enum novo no lugar do antigo, convertendo a coluna.
    await queryRunner.query(
      `ALTER TYPE "public"."propostas_status_enum" RENAME TO "propostas_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."propostas_status_enum" AS ENUM('rascunho', 'enviada', 'ganhou', 'nao_ganhou')`,
    );
    await queryRunner.query(
      `ALTER TABLE "propostas" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "propostas" ALTER COLUMN "status" TYPE "public"."propostas_status_enum" USING (
        CASE "status"::text WHEN 'finalizada' THEN 'enviada' ELSE "status"::text END
      )::"public"."propostas_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "propostas" ALTER COLUMN "status" SET DEFAULT 'rascunho'`,
    );
    await queryRunner.query(`DROP TYPE "public"."propostas_status_enum_old"`);

    // 2) data de envio + backfill das que já estão enviadas.
    await queryRunner.query(
      `ALTER TABLE "propostas" ADD "data_envio" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "propostas" SET "data_envio" = "updated_at" WHERE "status" <> 'rascunho'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "propostas" DROP COLUMN "data_envio"`);
    // Reverte o enum para o original (ganhou/nao_ganhou/enviada → finalizada).
    await queryRunner.query(
      `ALTER TYPE "public"."propostas_status_enum" RENAME TO "propostas_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."propostas_status_enum" AS ENUM('rascunho', 'finalizada')`,
    );
    await queryRunner.query(
      `ALTER TABLE "propostas" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "propostas" ALTER COLUMN "status" TYPE "public"."propostas_status_enum" USING (
        CASE "status"::text WHEN 'rascunho' THEN 'rascunho' ELSE 'finalizada' END
      )::"public"."propostas_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "propostas" ALTER COLUMN "status" SET DEFAULT 'rascunho'`,
    );
    await queryRunner.query(`DROP TYPE "public"."propostas_status_enum_old"`);
  }
}
