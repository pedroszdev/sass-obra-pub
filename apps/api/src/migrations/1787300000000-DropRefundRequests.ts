import { MigrationInterface, QueryRunner } from 'typeorm';

// Remove a fila de solicitações de reembolso (T-218, revisão de 04/08).
//
// 🔴 A tabela nasceu para um fluxo que o dono descartou no mesmo dia: o cliente
// NÃO pede reembolso pelo produto — pede por e-mail, e o dono escolhe quem
// reembolsar no `/admin`. Sem pedido registrado, não há fila para guardar.
//
// ⚠️ Nada de histórico se perde, e vale saber por quê:
//   - **quem foi reembolsado e por quem** já está no `admin_audit_log`, pelo
//     `@Audit('billing.reembolsar')` — a auditoria do `/admin` É o histórico;
//   - **o estado da cobrança** é do PROVEDOR: ela vira `REFUNDED` lá, e some
//     sozinha da lista de elegíveis. Espelhar isso no nosso banco criaria a
//     divergência que o resto do épico passou a sessão inteira consertando.
//
// Manter a tabela vazia seria dívida: schema que ninguém escreve, que o próximo
// leitor tenta entender, e que um dia alguém "conserta" preenchendo.
export class DropRefundRequests1787300000000 implements MigrationInterface {
  name = 'DropRefundRequests1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_refund_requests_status"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_requests_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_requests"`);
  }

  // Recria a estrutura para o `down` ser honesto. Os DADOS não voltam — mas a
  // tabela viveu menos de um dia e nunca recebeu linha em produção.
  public async down(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_requests_status" ON "refund_requests" ("status", "solicitado_em")`,
    );
  }
}
