import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-129 — webhook da Stripe.
//
// `stripe_events` existe por UMA razão: IDEMPOTÊNCIA. A Stripe REENTREGA eventos
// (é o comportamento normal dela, não exceção) — mesmo evento 2× não pode virar
// dois efeitos. O `event.id` é a chave: se já está aqui, o evento já foi tratado.
// Serve também de auditoria/reconciliação (T-143).
//
// `assinaturas.stripe_atualizado_em` resolve o OUTRO problema do webhook: os
// eventos chegam FORA DE ORDEM. Sem carimbar o instante do último evento
// aplicado, um `subscription.updated` atrasado sobrescreveria um estado mais novo
// — e ressuscitaria uma assinatura vencida (ou mataria uma ativa).
export class CreateStripeEvents1784900000000 implements MigrationInterface {
  name = 'CreateStripeEvents1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stripe_events" (
        "id" character varying(255) NOT NULL,
        "tipo" character varying(100) NOT NULL,
        "criado_em_stripe" TIMESTAMP WITH TIME ZONE NOT NULL,
        "processado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stripe_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "stripe_atualizado_em" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "stripe_atualizado_em"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stripe_events"`);
  }
}
