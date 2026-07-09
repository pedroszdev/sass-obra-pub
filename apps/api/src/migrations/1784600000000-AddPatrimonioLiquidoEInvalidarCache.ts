import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-141 + T-138.
//
// (1) `patrimonio_liquido` no perfil: a Lei 14.133 art. 69 permite exigir capital
//     social OU patrimônio líquido mínimo, e o edital costuma usar PL — número
//     diferente do capital social. Sem a coluna, o diagnóstico compararia a
//     exigência de PL contra o capital social e daria "apto" falso (T-139).
//
// (2) Invalidação CIRÚRGICA do cache de exigências. O schema da IA mudou (ganhou
//     `capitalSocial.base` e `habilitacaoPorRegistroCadastral`), mas reprocessar
//     TUDO custaria uma chamada de OpenAI por edital cacheado (§3.4). Em vez
//     disso, apagamos só as linhas comprovadamente afetadas:
//       (a) extração degenerada (zero exigência tipada) → provável edital SICAF,
//           que agora ganha diagnóstico via `habilitacaoPorRegistroCadastral`;
//       (b) `capitalSocial.exigido = false` mas o texto extraído menciona
//           patrimônio líquido em `outrosRequisitos` ou em `resumo.pontosDeAtencao`
//           → o falso negativo medido na T-139.
//     As demais linhas seguem válidas: o código trata `base` e o campo do SICAF
//     como opcionais, com o comportamento histórico como default.
export class AddPatrimonioLiquidoEInvalidarCache1784600000000 implements MigrationInterface {
  name = 'AddPatrimonioLiquidoEInvalidarCache1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_profiles" ADD "patrimonio_liquido" numeric(15,2)`,
    );

    // (a) degeneradas — mesma regra da T-137, agora que o SICAF é extraível.
    await queryRunner.query(`
      DELETE FROM "edital_exigencias"
      WHERE "status" = 'extraido'
        AND "exigencias" IS NOT NULL
        AND NOT COALESCE(("exigencias"->'registroConselho'->>'exigido')::bool, false)
        AND NOT COALESCE(("exigencias"->'capacidadeTecnica'->>'exigida')::bool, false)
        AND NOT COALESCE(("exigencias"->'capitalSocial'->>'exigido')::bool, false)
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements("exigencias"->'certidoes') c
          WHERE COALESCE((c->>'exigida')::bool, false)
        )
    `);

    // (b) PL mencionado fora do campo tipado → falso negativo da T-139.
    //     `patrim` cobre "patrimônio"/"patrimonio" (com e sem acento) em qualquer caixa.
    await queryRunner.query(`
      DELETE FROM "edital_exigencias"
      WHERE "status" = 'extraido'
        AND "exigencias" IS NOT NULL
        AND NOT COALESCE(("exigencias"->'capitalSocial'->>'exigido')::bool, false)
        AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements_text("exigencias"->'outrosRequisitos') o
            WHERE lower(o) LIKE '%patrim%'
          )
          OR (
            "resumo" IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text("resumo"->'pontosDeAtencao') p
              WHERE lower(p) LIKE '%patrim%'
            )
          )
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // As linhas de cache apagadas são resultado de IA, não schema: reverter
    // significaria reprocessar (custo de API) e restaurar um dado errado.
    await queryRunner.query(
      `ALTER TABLE "company_profiles" DROP COLUMN "patrimonio_liquido"`,
    );
  }
}
