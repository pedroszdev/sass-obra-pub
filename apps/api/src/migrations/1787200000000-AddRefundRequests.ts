import { MigrationInterface, QueryRunner } from 'typeorm';

// Fila de solicitações de reembolso (T-218, Épico 17).
//
// 🔴 Existe porque a decisão é do dono (04/08: toda solicitação passa por ele).
// Sem um lugar onde o pedido ESPERA, o cliente não teria como registrar que
// pediu e o dono não teria fila para trabalhar.
//
// ⚠️ Esta tabela NÃO decide acesso. O corte já existe desde a T-157 e é
// disparado pelo webhook `PAYMENT_REFUNDED` — ou seja, só depois de o dinheiro
// voltar. Cortar na aprovação seria tirar o acesso antes de devolver.
//
// ⚠️ `dentro_do_prazo` é CONGELADO no pedido, não recalculado na decisão: o
// prazo do CDC corre, e se o dono levar dois dias para decidir, recalcular
// transformaria um pedido legítimo em fora do prazo — punindo o cliente pela
// nossa demora.
export class AddRefundRequests1787200000000 implements MigrationInterface {
  name = 'AddRefundRequests1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refund_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "payment_id" character varying(255) NOT NULL,
        "valor_centavos" integer NOT NULL,
        "dentro_do_prazo" boolean NOT NULL,
        "motivo" text,
        "status" character varying(20) NOT NULL DEFAULT 'pendente',
        "solicitado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "decidido_em" TIMESTAMP WITH TIME ZONE,
        "decidido_por" uuid,
        "nota_decisao" text,
        CONSTRAINT "PK_refund_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_requests_user" ON "refund_requests" ("user_id")`,
    );
    // A fila do /admin lê por status e ordena por data — o índice serve os dois.
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_requests_status" ON "refund_requests" ("status", "solicitado_em")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_refund_requests_status"`);
    await queryRunner.query(`DROP INDEX "IDX_refund_requests_user"`);
    await queryRunner.query(`DROP TABLE "refund_requests"`);
  }
}
