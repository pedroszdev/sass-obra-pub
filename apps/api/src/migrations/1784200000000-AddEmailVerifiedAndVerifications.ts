import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-132 — verificação de e-mail: flag no user + tokens de verificação
// (espelha password_resets). Aditiva. À mão.
export class AddEmailVerifiedAndVerifications1784200000000 implements MigrationInterface {
  name = 'AddEmailVerifiedAndVerifications1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "email_verified_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE TABLE "email_verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_email_verifications" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_email_verifications_token_hash" ON "email_verifications" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_verifications_user" ON "email_verifications" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_verifications" ADD CONSTRAINT "FK_email_verifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_verifications" DROP CONSTRAINT "FK_email_verifications_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_email_verifications_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_email_verifications_token_hash"`,
    );
    await queryRunner.query(`DROP TABLE "email_verifications"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "email_verified_at"`,
    );
  }
}
