import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-40 — perfil de habilitação do empreiteiro: company_profiles (1:1
// com users), certidoes e atestados (N por user). Migration escrita à mão
// (padrão do repo) — as três tabelas referenciam users(id) ON DELETE CASCADE.
export class CreateCompanyProfile1782400000000 implements MigrationInterface {
  name = 'CreateCompanyProfile1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."company_profiles_registro_profissional_tipo_enum" AS ENUM('CREA', 'CAU')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."certidoes_tipo_enum" AS ENUM('CND_FEDERAL', 'FGTS', 'TRABALHISTA', 'ESTADUAL', 'MUNICIPAL', 'FALENCIA', 'REGISTRO_CONSELHO', 'OUTRA')`,
    );

    await queryRunner.query(
      `CREATE TABLE "company_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "razao_social" character varying(255), "capital_social" numeric(15,2), "registro_profissional_tipo" "public"."company_profiles_registro_profissional_tipo_enum", "registro_profissional_numero" character varying(50), "registro_profissional_uf" character varying(2), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_company_profiles" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_company_profiles_user" ON "company_profiles" ("user_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "certidoes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "tipo" "public"."certidoes_tipo_enum" NOT NULL, "descricao" character varying(255), "numero" character varying(100), "orgao_emissor" character varying(255), "data_emissao" date, "data_validade" date, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_certidoes" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_certidoes_user_validade" ON "certidoes" ("user_id", "data_validade")`,
    );

    await queryRunner.query(
      `CREATE TABLE "atestados" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "descricao" text NOT NULL, "quantitativo" numeric(15,2), "unidade" character varying(20), "valor" numeric(15,2), "contratante" character varying(255), "ano" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_atestados" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_atestados_user" ON "atestados" ("user_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "company_profiles" ADD CONSTRAINT "FK_company_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "certidoes" ADD CONSTRAINT "FK_certidoes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "atestados" ADD CONSTRAINT "FK_atestados_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "atestados" DROP CONSTRAINT "FK_atestados_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "certidoes" DROP CONSTRAINT "FK_certidoes_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_profiles" DROP CONSTRAINT "FK_company_profiles_user"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_atestados_user"`);
    await queryRunner.query(`DROP TABLE "atestados"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_certidoes_user_validade"`,
    );
    await queryRunner.query(`DROP TABLE "certidoes"`);

    await queryRunner.query(`DROP INDEX "public"."UQ_company_profiles_user"`);
    await queryRunner.query(`DROP TABLE "company_profiles"`);

    await queryRunner.query(`DROP TYPE "public"."certidoes_tipo_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."company_profiles_registro_profissional_tipo_enum"`,
    );
  }
}
