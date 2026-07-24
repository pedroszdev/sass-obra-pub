import { MigrationInterface, QueryRunner } from 'typeorm';

// Fila de solicitações de titular LGPD (T-196). Registro dos pedidos de
// acesso/exportação/correção/exclusão que chegam por e-mail, com prazo e o
// registro do atendimento. Sem FK para users: a prova de conformidade precisa
// sobreviver à exclusão da conta.
export class CreateLgpdRequests1786300000000 implements MigrationInterface {
  name = 'CreateLgpdRequests1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "lgpd_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tipo" character varying(20) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'aberta',
        "requester_email" character varying(255) NOT NULL,
        "user_id" uuid,
        "descricao" text,
        "resolucao" text,
        "prazo" TIMESTAMP WITH TIME ZONE NOT NULL,
        "atendida_em" TIMESTAMP WITH TIME ZONE,
        "created_by_admin_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lgpd_requests" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_lgpd_requests_status_prazo" ON "lgpd_requests" ("status", "prazo")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_lgpd_requests_status_prazo"`,
    );
    await queryRunner.query(`DROP TABLE "lgpd_requests"`);
  }
}
