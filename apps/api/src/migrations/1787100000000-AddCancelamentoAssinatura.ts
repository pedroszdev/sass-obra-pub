import { MigrationInterface, QueryRunner } from 'typeorm';

// Cancelamento self-service (T-217, Épico 17).
//
// Três colunas, e o motivo de cada uma:
//
//   `cancelado_em`         — QUANDO o cliente pediu. Não confundir com o fim do
//                            acesso: cancelar não corta na hora (T-144), o
//                            acesso segue até `current_period_end`. São datas
//                            diferentes e as duas importam no /admin.
//   `cancelamento_motivo`  — código da lista fechada (ver `MOTIVOS_CANCELAMENTO`).
//                            É o dado que o dono quer olhar no beta: por que
//                            estão saindo.
//   `cancelamento_detalhe` — texto livre, opcional. Limitado a 500 no banco E no
//                            DTO — campo livre sem teto é convite a lixo.
//
// ⚠️ Ficam na ASSINATURA, não em tabela própria (decisão do dono, 31/07): quem
// cancelar, voltar e cancelar de novo SOBRESCREVE o motivo anterior. É perda de
// histórico consciente, aceita porque a conta é 1:1 com o usuário e o volume do
// beta não justifica entidade + tela novas. Se um dia a pergunta virar "como o
// motivo mudou entre a 1ª e a 2ª saída", aí sim nasce a tabela.
export class AddCancelamentoAssinatura1787100000000 implements MigrationInterface {
  name = 'AddCancelamentoAssinatura1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "cancelado_em" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "cancelamento_motivo" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" ADD "cancelamento_detalhe" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN "cancelamento_detalhe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN "cancelamento_motivo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assinaturas" DROP COLUMN "cancelado_em"`,
    );
  }
}
