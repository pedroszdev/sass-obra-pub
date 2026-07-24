import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../common/decimal.transformer';

// Qual trabalho de IA gerou a linha. `exigencias` cobre exigências E resumo:
// saem da MESMA chamada (T-49/T-50), então separá-las inventaria um custo que
// não existe em separado. `itens` é a extração da planilha (T-64).
export const AI_FEATURES = ['exigencias', 'itens'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

// Quem provocou o uso. Importa porque a conta do mês tem duas naturezas bem
// diferentes: `usuario` escala com o USO, `precomputacao` escala com a
// CAPTAÇÃO (roda sobre editais que ninguém abriu ainda — ver o cuidado de custo
// da T-140).
export const AI_ORIGENS = ['usuario', 'precomputacao', 'admin'] as const;
export type AiOrigem = (typeof AI_ORIGENS)[number];

// Registro de CADA uso de IA (T-190a) — uma linha por chamada real ou por cache
// hit. Existe porque o custo que já gravávamos vive na LINHA DE CACHE
// (`edital_exigencias.custo_usd`, `edital_itens_extracao.custo_usd`), que é 1
// por edital: de lá não sai nem "quanto o fulano gastou" (não há coluna de
// usuário) nem hit rate (um hit não escreve nada). Este log é append-only e
// responde as duas.
//
// ⚠️ NÃO é a fonte do teto de custo (T-133) nem da tela da T-190b: essas
// continuam somando as tabelas de cache. Esta tabela NASCE VAZIA, e migrar o
// circuit-breaker para ela zeraria o gasto acumulado — desligando o teto no
// caminho do dinheiro. Convivência deliberada: totais pelo caminho antigo,
// recortes novos (por conta, hit rate) por aqui.
//
// Sem FK em `user_id` nem em `edital_id`, de propósito: é registro contábil e
// precisa sobreviver à exclusão da conta (LGPD) e à retenção de editais (T-154,
// que apaga edital encerrado sem vínculo). Mesma razão do `admin_audit_log`.
@Index('IDX_ai_usage_created', ['createdAt'])
@Index('IDX_ai_usage_user', ['userId'])
@Index('IDX_ai_usage_feature', ['feature'])
@Entity('ai_usage')
export class AiUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  feature!: AiFeature;

  @Column({ type: 'varchar', length: 20 })
  origem!: AiOrigem;

  // Null quando não há usuário atrás do uso (pré-computação em background).
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'uuid', name: 'edital_id', nullable: true })
  editalId!: string | null;

  // true = serviu do cache, SEM chamar a OpenAI (custo zero). É metade do hit
  // rate; a outra metade são as linhas com false.
  @Column({ type: 'boolean', name: 'cache_hit', default: false })
  cacheHit!: boolean;

  // Modelo que produziu o resultado. Num hit vem do que está gravado no cache
  // (pode ser null em cache antigo); numa chamada real é o modelo em uso.
  @Column({ type: 'varchar', length: 100, nullable: true })
  modelo!: string | null;

  @Column({ type: 'int', name: 'prompt_tokens', default: 0 })
  promptTokens!: number;

  @Column({ type: 'int', name: 'completion_tokens', default: 0 })
  completionTokens!: number;

  // Custo em USD. SEMPRE 0 no cache hit — é justamente o que o cache economiza.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 6,
    name: 'custo_usd',
    default: 0,
    transformer: decimalTransformer,
  })
  custoUsd!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
