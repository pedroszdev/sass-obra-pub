import { MigrationInterface, QueryRunner } from 'typeorm';

// Notas internas por conta (T-186) — mini-CRM do beta.
export class CreateAccountNotes1786100000000 implements MigrationInterface {
  name = 'CreateAccountNotes1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "account_notes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "autor_id" uuid NOT NULL,
        "texto" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_account_notes" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_account_notes_user_created" ON "account_notes" ("user_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_account_notes_user_created"`,
    );
    await queryRunner.query(`DROP TABLE "account_notes"`);
  }
}
