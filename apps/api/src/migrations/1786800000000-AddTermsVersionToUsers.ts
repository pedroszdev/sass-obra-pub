import { MigrationInterface, QueryRunner } from 'typeorm';

// Versão dos termos aceita por conta (T-196). Complementa `terms_accepted_at`
// (que só guarda QUANDO): agora registramos QUAL versão foi aceita, para forçar
// re-aceite quando o dono publicar texto novo (T-179). Nullable — contas antigas
// nascem sem versão; ficam em dia até haver uma versão vigente configurada.
export class AddTermsVersionToUsers1786800000000 implements MigrationInterface {
  name = 'AddTermsVersionToUsers1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "terms_version" character varying(40)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "terms_version"`);
  }
}
