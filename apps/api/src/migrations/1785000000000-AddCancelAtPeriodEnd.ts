import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-144 — rastrear o cancelamento agendado. Quem cancela no Portal da
// Stripe fica com status `active` + `cancel_at_period_end: true` (mantém o acesso
// até o fim do período). Sem esta coluna, a plataforma mostrava "renova em X" a
// quem já tinha cancelado.
export class AddCancelAtPeriodEnd1785000000000 implements MigrationInterface {
  name = 'AddCancelAtPeriodEnd1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "cancel_at_period_end" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "cancel_at_period_end"`,
    );
  }
}
