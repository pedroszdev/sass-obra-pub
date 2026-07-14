import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-154 (retenção) — `raw_payload` passa a aceitar NULL.
//
// O dump cru da fonte é uso INTERNO (reprocessar/depurar) e é o que mais pesa por
// linha. Num edital já encerrado ele não serve para mais nada — mas a LINHA pode
// precisar ficar: `favoritos` e `propostas` referenciam `editais` com ON DELETE
// CASCADE, então apagar o edital apagaria a PROPOSTA do empreiteiro (preços, BDI,
// cronograma). A retenção então zera o payload dos encerrados que têm vínculo, em
// vez de destruir o trabalho do usuário — e para isso a coluna precisa ser
// nullable. NULL aqui significa "não guardamos mais o dump", não "nunca teve".
//
// Migration à mão (padrão do repo) — evita o papercut do migration:generate, que
// recria o DROP do índice GIN (§10.1).
export class AllowNullRawPayload1784700000000 implements MigrationInterface {
  name = 'AllowNullRawPayload1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "editais" ALTER COLUMN "raw_payload" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverter exige um valor para as linhas já zeradas — '{}' é o vazio honesto
    // (o dump original não volta; ele foi descartado de propósito).
    await queryRunner.query(
      `UPDATE "editais" SET "raw_payload" = '{}'::jsonb WHERE "raw_payload" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "editais" ALTER COLUMN "raw_payload" SET NOT NULL`,
    );
  }
}
