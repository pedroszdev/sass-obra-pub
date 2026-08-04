import { MigrationInterface, QueryRunner } from 'typeorm';

// Marca de NFS-e emitida à mão (T-219, decisão do dono em 04/08).
//
// 🔴 A emissão AUTOMÁTICA não foi construída, e a decisão é boa: sondei o
// `POST /subscriptions/{id}/invoiceSettings` e ele exige **código de serviço
// municipal e descrição do serviço** — que dependem da prefeitura e do contador,
// e a conta Asaas ainda é PF. Escrever aquilo às cegas, num caminho fiscal onde
// errar é errar ISS, seria o pior lugar para adivinhar. Em vez disso, o sistema
// AVISA quais cobranças ficaram sem nota e o dono emite manualmente.
//
// ⚠️ Esta tabela existe porque o fato *"eu emiti fora do sistema"* não vive em
// provedor nenhum — diferente do reembolso, cuja tabela foi apagada justamente
// porque o Asaas já sabia a resposta. Sem ela, o alerta repetiria sobre a mesma
// cobrança para sempre, e alerta que repete deixa de ser lido.
export class AddNfseEmitidas1787400000000 implements MigrationInterface {
  name = 'AddNfseEmitidas1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "nfse_emitidas" (
        "payment_id" character varying(255) NOT NULL,
        "emitida_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "emitida_por" uuid NOT NULL,
        "numero" character varying(60),
        CONSTRAINT "PK_nfse_emitidas" PRIMARY KEY ("payment_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "nfse_emitidas"`);
  }
}
