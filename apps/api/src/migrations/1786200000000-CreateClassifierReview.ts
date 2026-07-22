import { MigrationInterface, QueryRunner } from 'typeorm';

// Fila de revisão do classificador (T-191) — dataset rotulado.
export class CreateClassifierReview1786200000000 implements MigrationInterface {
  name = 'CreateClassifierReview1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "classifier_review" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "edital_id" uuid NOT NULL,
        "veredito" character varying(10) NOT NULL,
        "razao_original" character varying(20),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_classifier_review" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_classifier_review_edital" UNIQUE ("edital_id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "classifier_review"`);
  }
}
