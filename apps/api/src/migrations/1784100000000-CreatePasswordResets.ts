import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-101 — tokens de redefinição de senha (hash + expiração + uso único).
// Espelha refresh_tokens. À mão.
export class CreatePasswordResets1784100000000 implements MigrationInterface {
  name = 'CreatePasswordResets1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_resets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_password_resets" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_password_resets_token_hash" ON "password_resets" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_password_resets_user" ON "password_resets" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_resets" ADD CONSTRAINT "FK_password_resets_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "password_resets" DROP CONSTRAINT "FK_password_resets_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_password_resets_user"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_password_resets_token_hash"`,
    );
    await queryRunner.query(`DROP TABLE "password_resets"`);
  }
}
