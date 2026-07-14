import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-127 — assinatura por usuário, com trial de 7 dias SEM cartão.
//
// O trial nasce NO NOSSO BANCO (decisão do dono): os campos `stripe_*` só são
// preenchidos quando houver intenção de compra (T-128) — não criamos um Customer
// na Stripe para cada curioso que se cadastra.
//
// BACKFILL: os usuários que JÁ existem (o dono e quem testou) ganham 7 dias de
// trial a partir de AGORA — ou seja, do deploy desta migration. É o comportamento
// honesto: ninguém perde acesso de surpresa, e o dono vê a contagem funcionando
// de verdade. Marcá-los como `active` de graça esconderia justamente o cenário
// que precisa ser testado.
//
// Migration à mão (padrão do repo) — evita o papercut do migration:generate, que
// recria o DROP do índice GIN (§10.1).
export class CreateAssinaturas1784800000000 implements MigrationInterface {
  name = 'CreateAssinaturas1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "assinaturas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL,
        "plano" character varying(50) NOT NULL DEFAULT 'mensal',
        "trial_ends_at" TIMESTAMP WITH TIME ZONE,
        "current_period_end" TIMESTAMP WITH TIME ZONE,
        "past_due_desde" TIMESTAMP WITH TIME ZONE,
        "stripe_customer_id" character varying(255),
        "stripe_subscription_id" character varying(255),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_assinaturas" PRIMARY KEY ("id")
      )
    `);
    // 1 assinatura por usuário; excluir a conta (T-102/LGPD) leva a assinatura.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_assinaturas_user" ON "assinaturas" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD CONSTRAINT "FK_assinaturas_user"
       FOREIGN KEY ("user_id") REFERENCES "users"("id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Busca pelo id da Stripe no webhook (T-129) — sem isto seria full scan.
    await queryRunner.query(
      `CREATE INDEX "idx_assinaturas_stripe_sub" ON "assinaturas" ("stripe_subscription_id")`,
    );

    // Backfill: todo usuário existente ganha 7 dias de trial a partir de agora.
    await queryRunner.query(`
      INSERT INTO "assinaturas" ("user_id", "status", "trial_ends_at")
      SELECT u."id", 'trialing', now() + interval '7 days'
      FROM "users" u
      WHERE NOT EXISTS (
        SELECT 1 FROM "assinaturas" a WHERE a."user_id" = u."id"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "assinaturas"`);
  }
}
