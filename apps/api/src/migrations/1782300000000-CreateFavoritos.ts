import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFavoritos1782300000000 implements MigrationInterface {
  name = 'CreateFavoritos1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "favoritos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "edital_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_favoritos" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_favoritos_user_edital" ON "favoritos" ("user_id", "edital_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_favoritos_user_created" ON "favoritos" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "favoritos" ADD CONSTRAINT "FK_favoritos_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favoritos" ADD CONSTRAINT "FK_favoritos_edital" FOREIGN KEY ("edital_id") REFERENCES "editais"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favoritos" DROP CONSTRAINT "FK_favoritos_edital"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favoritos" DROP CONSTRAINT "FK_favoritos_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_favoritos_user_created"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_favoritos_user_edital"`);
    await queryRunner.query(`DROP TABLE "favoritos"`);
  }
}
