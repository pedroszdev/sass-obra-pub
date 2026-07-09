import { MigrationInterface, QueryRunner } from 'typeorm';

// BACKLOG T-137 (achado da T-107) — invalida extrações DEGENERADAS do cache.
//
// Por que existe: `getOrExtract` só reprocessa status `erro` (§3.4, cache
// obrigatório). Uma extração feita sobre o documento errado (ex.: um apêndice
// "As Built" que passava no portão antigo) era gravada como `extraido` com ZERO
// exigência tipada — e ficava assim para sempre, deixando o diagnóstico daquele
// edital permanentemente `indefinido` (T-116b).
//
// Apagar a linha faz o edital ser reprocessado sob demanda, agora com o ranking
// e o portão corrigidos. Custa UMA chamada de IA por edital afetado, uma vez.
//
// "Degenerada" = nenhuma certidão exigida, nenhum registro de conselho, nenhuma
// capacidade técnica e nenhum capital social. `garantia` e `outrosRequisitos`
// ficam de fora de propósito: pela T-116 eles são observações, não itens
// verificáveis — um edital só com eles já cai em `indefinido` de qualquer jeito.
//
// ⚠️ Editais que remetem a habilitação ao SICAF legitimamente não enumeram
// certidões. Eles serão reprocessados e voltarão a ficar vazios (uma chamada
// desperdiçada, uma vez). Tratá-los de verdade exige campo novo no schema da IA
// — e, por §3.4, uma nova medição de acerto. Fica para task própria.
export class InvalidarExtracoesDegeneradas1784500000000 implements MigrationInterface {
  name = 'InvalidarExtracoesDegeneradas1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }

  public async down(): Promise<void> {
    // Irreversível por natureza: a linha apagada era um resultado de IA, não
    // schema. Reverter significaria reprocessar (custo de API) — e o dado antigo
    // estava errado. No-op explícito em vez de fingir que dá para restaurar.
  }
}
