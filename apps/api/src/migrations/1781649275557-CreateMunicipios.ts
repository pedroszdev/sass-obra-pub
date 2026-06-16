import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMunicipios1781649275557 implements MigrationInterface {
  name = 'CreateMunicipios1781649275557';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "municipios" ("codigo_ibge" character(7) NOT NULL, "nome" character varying(150) NOT NULL, "nome_normalizado" character varying(150) NOT NULL, "uf" character varying(2) NOT NULL, CONSTRAINT "PK_80380622da179d44bec736f20fb" PRIMARY KEY ("codigo_ibge"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_municipios_nome_normalizado" ON "municipios"  ("nome_normalizado") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_municipios_uf" ON "municipios"  ("uf") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_municipios_uf"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_municipios_nome_normalizado"`,
    );
    await queryRunner.query(`DROP TABLE "municipios"`);
  }
}
