import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-157 — corte de acesso no reembolso.
//
// Por que uma coluna, e não "marcar como cancelada": a reconciliação (T-143)
// relê o estado ATUAL na Stripe e corrige o que divergir. Um `canceled` escrito
// só do nosso lado seria DESFEITO no ciclo seguinte, e o acesso voltaria.
// Cancelar na Stripe também não basta: o `currentPeriodEnd` continua no futuro e
// a regra da T-144 ("cancelou mas pagou, usa até o fim") liberaria de novo — ela
// está certa para cancelamento e é exatamente o que o reembolso precisa desligar.
//
// Este é o fato que a Stripe não nos conta num campo que a reconciliação leia:
// "esta assinatura foi devolvida". Por isso vive aqui e fica FORA do montarPatch.
export class AddReembolsadaEm1785100000000 implements MigrationInterface {
  name = 'AddReembolsadaEm1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "reembolsada_em" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "reembolsada_em"`,
    );
  }
}
