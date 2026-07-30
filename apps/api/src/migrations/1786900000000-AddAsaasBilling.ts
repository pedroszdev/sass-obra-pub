import { MigrationInterface, QueryRunner } from 'typeorm';

// Modelo de dados do Asaas (T-211, Épico 17). CONVIVE com o da Stripe.
//
// ⚠️ NENHUMA coluna da Stripe é apagada aqui, e isso é decisão, não esquecimento:
// até o corte (T-224) elas são a rede de segurança e o histórico. Um usuário pode
// ter histórico Stripe e assinatura Asaas ao mesmo tempo.
//
// O que entra:
//   1. `asaas_customer_id` / `asaas_subscription_id` — os ids do provedor novo.
//   2. `provider` — QUEM cobra esta assinatura hoje. Não dá para deduzir pela
//      presença dos ids: depois do corte, uma conta pode ter o id da Stripe como
//      histórico e estar sendo cobrada pelo Asaas.
//   3. `asaas_atualizado_em` — guarda de ORDEM, igual ao `stripe_atualizado_em`.
//      A entrega do Asaas é "at least once" (medido na T-209) e sem carimbo um
//      evento atrasado sobrescreve estado mais novo.
//   4. `asaas_events` — idempotência do webhook pela PK, espelhando `stripe_events`.
//
// 📌 `asaas_payment_id` estava no escopo original e ficou de FORA de propósito:
// uma assinatura tem N cobranças, então guardar "a" cobrança na assinatura é
// espelho de estado do provedor — justamente o que o `stripe-billing.service.ts`
// evita ("um espelho dessincronizado mostraria ao cliente um dado que não é mais
// o dele"). O webhook também não precisa dele para localizar a assinatura (o
// evento traz o id da assinatura). Se a T-216 provar que a tela precisa da
// cobrança em aberto, ela vem por leitura ao vivo ou por coluna própria, aí com
// motivo medido.
export class AddAsaasBilling1786900000000 implements MigrationInterface {
  name = 'AddAsaasBilling1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "asaas_customer_id" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "asaas_subscription_id" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "provider" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "asaas_atualizado_em" TIMESTAMP WITH TIME ZONE`,
    );

    // Backfill: quem já tem assinatura na Stripe passa a dizê-lo explicitamente.
    // Quem não tem fica NULL — é o estado correto de quem está só no trial, que é
    // nosso e não existe em provedor nenhum (T-127).
    await queryRunner.query(
      `UPDATE "assinaturas" SET "provider" = 'stripe' WHERE "stripe_subscription_id" IS NOT NULL`,
    );

    // O webhook busca a assinatura por estes ids em TODA chamada.
    // ⚠️ `asaas_subscription_id` é ÚNICO: duas linhas apontando para a mesma
    // assinatura no provedor é estado corrompido, e é melhor falhar na escrita do
    // que descobrir na hora de cobrar. O de cliente é índice comum — o mesmo
    // cliente pode ter mais de uma assinatura ao longo do tempo.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_assinaturas_asaas_sub" ON "assinaturas" ("asaas_subscription_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assinaturas_asaas_customer" ON "assinaturas" ("asaas_customer_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "asaas_events" (
        "id" character varying(255) NOT NULL,
        "tipo" character varying(100) NOT NULL,
        "criado_em_asaas" TIMESTAMP WITH TIME ZONE,
        "processado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_asaas_events" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "asaas_events"`);
    await queryRunner.query(`DROP INDEX "idx_assinaturas_asaas_customer"`);
    await queryRunner.query(`DROP INDEX "idx_assinaturas_asaas_sub"`);
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN "asaas_atualizado_em"`,
    );
    await queryRunner.query(`ALTER TABLE "assinaturas" DROP COLUMN "provider"`);
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN "asaas_subscription_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN "asaas_customer_id"`,
    );
  }
}
