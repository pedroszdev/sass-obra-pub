import { MigrationInterface, QueryRunner } from 'typeorm';

// Liga o checkout hospedado à assinatura local (T-216, correção).
//
// 🔴 POR QUE ISTO EXISTE — bug real, achado no 1º pagamento de verdade:
// o checkout hospedado do Asaas **cria um cliente NOVO** com os dados que o
// pagador digita na página dele. Não há como vinculá-lo a um cliente existente
// (`POST /v3/checkouts` não aceita `customer`; `customerData` só pré-preenche).
// Resultado: a cobrança nasce num cliente e numa assinatura que o nosso banco
// nunca viu, e o webhook não consegue achar o dono — o pagamento é confirmado e
// **o cliente continua no trial**.
//
// A ponte é o `checkoutSession`: a assinatura criada pelo checkout guarda o id
// do checkout que a originou (medido no sandbox). Guardando esse id aqui, o
// webhook resolve `payment → subscription → checkoutSession → esta linha`.
//
// ⚠️ Não dá para usar `externalReference` para isso: a cobrança nasce SEM ele
// (medido — veio vazio), e o `GET /checkouts/{id}` **não existe** (404).
export class AddAsaasCheckoutId1787000000000 implements MigrationInterface {
  name = 'AddAsaasCheckoutId1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "asaas_checkout_id" character varying(255)`,
    );
    // O webhook busca por esta coluna quando não achou por assinatura/cliente.
    await queryRunner.query(
      `CREATE INDEX "idx_assinaturas_asaas_checkout" ON "assinaturas" ("asaas_checkout_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_assinaturas_asaas_checkout"`);
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN "asaas_checkout_id"`,
    );
  }
}
