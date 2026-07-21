import { MigrationInterface, QueryRunner } from 'typeorm';

// Trilha de auditoria do admin (T-182). Escrita à mão (não via migration:generate)
// — simples e sem o papercut do índice GIN (CLAUDE.md §10).
export class CreateAdminAuditLog1785200000000 implements MigrationInterface {
  name = 'CreateAdminAuditLog1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "admin_audit_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "admin_user_id" uuid NOT NULL,
        "action" character varying(120) NOT NULL,
        "method" character varying(10) NOT NULL,
        "path" character varying(255) NOT NULL,
        "target_id" character varying(64),
        "status_code" integer NOT NULL,
        "ip" character varying(64),
        "summary" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_audit_log" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_admin_user" ON "admin_audit_log" ("admin_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_action" ON "admin_audit_log" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_created_at" ON "admin_audit_log" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_admin_audit_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_admin_audit_action"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_admin_audit_admin_user"`);
    await queryRunner.query(`DROP TABLE "admin_audit_log"`);
  }
}
