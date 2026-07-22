import { MigrationInterface, QueryRunner } from 'typeorm';

// Conferência de saídas de IA (T-200) — dataset rotulado + taxa de acerto viva.
export class CreateAiOutputReview1785600000000 implements MigrationInterface {
  name = 'CreateAiOutputReview1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ai_output_review" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tipo" character varying(20) NOT NULL,
        "edital_id" uuid NOT NULL,
        "veredito" character varying(10) NOT NULL,
        "nota" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_output_review" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ai_output_review_tipo_edital" UNIQUE ("tipo", "edital_id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_output_review"`);
  }
}
