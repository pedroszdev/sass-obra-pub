import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-60 (Épico 6) — orçamento integrado ao edital: propostas (N por user
// e por edital) e proposta_itens (N por proposta, ordenável). Migration escrita
// à mão (padrão do repo). FKs ON DELETE CASCADE: para users/editais na proposta,
// e da proposta para seus itens. Não persiste totais — derivados pelo motor de
// cálculo (T-66).
export class CreatePropostas1782900000000 implements MigrationInterface {
  name = 'CreatePropostas1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."propostas_status_enum" AS ENUM('rascunho', 'finalizada')`,
    );

    await queryRunner.query(
      `CREATE TABLE "propostas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "edital_id" uuid NOT NULL, "titulo" character varying(255) NOT NULL, "status" "public"."propostas_status_enum" NOT NULL DEFAULT 'rascunho', "bdi_percentual" numeric(5,2), "valor_referencia" numeric(15,2), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_propostas" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_propostas_user_created" ON "propostas" ("user_id", "created_at")`,
    );

    await queryRunner.query(
      `CREATE TABLE "proposta_itens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "proposta_id" uuid NOT NULL, "descricao" text NOT NULL, "unidade" character varying(20), "quantidade" numeric(15,4), "preco_unitario" numeric(15,2), "ordem" integer NOT NULL DEFAULT 0, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_proposta_itens" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_proposta_itens_proposta_ordem" ON "proposta_itens" ("proposta_id", "ordem")`,
    );

    await queryRunner.query(
      `ALTER TABLE "propostas" ADD CONSTRAINT "FK_propostas_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "propostas" ADD CONSTRAINT "FK_propostas_edital" FOREIGN KEY ("edital_id") REFERENCES "editais"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "proposta_itens" ADD CONSTRAINT "FK_proposta_itens_proposta" FOREIGN KEY ("proposta_id") REFERENCES "propostas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "proposta_itens" DROP CONSTRAINT "FK_proposta_itens_proposta"`,
    );
    await queryRunner.query(
      `ALTER TABLE "propostas" DROP CONSTRAINT "FK_propostas_edital"`,
    );
    await queryRunner.query(
      `ALTER TABLE "propostas" DROP CONSTRAINT "FK_propostas_user"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_proposta_itens_proposta_ordem"`,
    );
    await queryRunner.query(`DROP TABLE "proposta_itens"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_propostas_user_created"`);
    await queryRunner.query(`DROP TABLE "propostas"`);

    await queryRunner.query(`DROP TYPE "public"."propostas_status_enum"`);
  }
}
