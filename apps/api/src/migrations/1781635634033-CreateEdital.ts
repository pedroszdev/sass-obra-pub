import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEdital1781635634033 implements MigrationInterface {
  name = 'CreateEdital1781635634033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."editais_fonte_enum" AS ENUM('PNCP')`,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'obrapub',
        'public',
        'editais',
        'GENERATED_COLUMN',
        'objeto_busca',
        "to_tsvector('portuguese', coalesce(objeto, ''))",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE "editais" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fonte" "public"."editais_fonte_enum" NOT NULL, "id_externo" character varying(100) NOT NULL, "orgao_nome" character varying(255) NOT NULL, "orgao_cnpj" character varying(14), "uf" character varying(2) NOT NULL, "municipio_nome" character varying(255) NOT NULL, "codigo_ibge" character varying(7), "objeto" text NOT NULL, "modalidade_id" integer NOT NULL, "modalidade_nome" character varying(100) NOT NULL, "valor_estimado" numeric(15,2), "data_publicacao" TIMESTAMP WITH TIME ZONE NOT NULL, "prazo_proposta" TIMESTAMP WITH TIME ZONE, "link_origem" text, "situacao" character varying(100), "is_obra" boolean NOT NULL DEFAULT false, "objeto_busca" tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(objeto, ''))) STORED, "raw_payload" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c59302138fa6ad4bacf58733b12" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_editais_codigo_ibge" ON "editais"  ("codigo_ibge") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_editais_valor_estimado" ON "editais"  ("valor_estimado") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_editais_data_publicacao" ON "editais"  ("data_publicacao") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_editais_uf_is_obra_data" ON "editais"  ("uf", "is_obra", "data_publicacao") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_editais_fonte_id_externo" ON "editais"  ("fonte", "id_externo") `,
    );
    // Índice GIN para busca textual (full-text PT) — adicionado à mão:
    // o TypeORM não expressa GIN nos decorators.
    await queryRunner.query(
      `CREATE INDEX "IDX_editais_objeto_busca" ON "editais" USING gin ("objeto_busca")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_editais_objeto_busca"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_editais_fonte_id_externo"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_editais_uf_is_obra_data"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_editais_data_publicacao"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_editais_valor_estimado"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_editais_codigo_ibge"`);
    await queryRunner.query(`DROP TABLE "editais"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'objeto_busca', 'obrapub', 'public', 'editais'],
    );
    await queryRunner.query(`DROP TYPE "public"."editais_fonte_enum"`);
  }
}
