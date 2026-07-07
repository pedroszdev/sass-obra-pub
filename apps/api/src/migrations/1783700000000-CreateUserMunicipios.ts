import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-94 — municípios de atuação preferidos do usuário (N:N com municipios).
// Complementa a `uf` de cadastro. PK composta (user_id, codigo_ibge); FKs em
// cascata. Aditiva. À mão.
export class CreateUserMunicipios1783700000000 implements MigrationInterface {
  name = 'CreateUserMunicipios1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_municipios" ("user_id" uuid NOT NULL, "codigo_ibge" character(7) NOT NULL, CONSTRAINT "PK_user_municipios" PRIMARY KEY ("user_id", "codigo_ibge"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_municipios" ADD CONSTRAINT "FK_user_municipios_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_municipios" ADD CONSTRAINT "FK_user_municipios_municipio" FOREIGN KEY ("codigo_ibge") REFERENCES "municipios"("codigo_ibge") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_municipios" DROP CONSTRAINT "FK_user_municipios_municipio"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_municipios" DROP CONSTRAINT "FK_user_municipios_user"`,
    );
    await queryRunner.query(`DROP TABLE "user_municipios"`);
  }
}
