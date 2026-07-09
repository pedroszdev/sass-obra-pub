import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-126 — login com Google: a conta pode nascer sem senha.
//   - password_hash vira nullable (usuário Google nunca definiu senha);
//   - provider registra a origem da conta (local | google);
//   - google_sub guarda o id estável do Google, único quando presente.
// Aditiva. À mão (migration:generate derrubaria o índice GIN — CLAUDE.md §10.1).
//
// O `down` só volta password_hash a NOT NULL se não houver conta sem senha —
// senão o ALTER falharia no meio e deixaria o schema num estado ambíguo.
export class AddGoogleAuthToUsers1784400000000 implements MigrationInterface {
  name = 'AddGoogleAuthToUsers1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_provider_enum" AS ENUM('local', 'google')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "provider" "public"."users_provider_enum" NOT NULL DEFAULT 'local'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "google_sub" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_google_sub" ON "users" ("google_sub")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_users_google_sub"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_sub"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "provider"`);
    await queryRunner.query(`DROP TYPE "public"."users_provider_enum"`);
    // Contas sem senha (Google) impedem o NOT NULL — apagá-las seria perda de
    // dado silenciosa, então falhamos alto e o operador decide.
    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM "users" WHERE "password_hash" IS NULL`,
    )) as [{ count: number }];
    if (count > 0) {
      throw new Error(
        `Não dá para reverter: ${count} conta(s) sem senha (criadas via Google). ` +
          `Defina uma senha para elas ou remova-as antes de rodar este down.`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL`,
    );
  }
}
