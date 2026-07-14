import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Edital } from './edital.entity';

// Retenção de dados (BACKLOG T-154; formaliza a dívida §10.2). A captação por
// demanda (T-34) traz UF inteira e o banco só crescia — no Postgres free isso
// tem prazo de validade.
//
// A REGRA QUE NÃO PODE SER QUEBRADA: `favoritos` e `propostas` referenciam
// `editais` com ON DELETE CASCADE. Apagar um edital apaga junto a PROPOSTA do
// empreiteiro — preços, BDI, cronograma, o trabalho dele. Por isso a retenção
// separa o que é lixo NOSSO do que é trabalho DELE:
//
//   1. Encerrado e SEM vínculo (ninguém salvou nem montou proposta) → apaga a
//      linha. O cascade leva o cache de IA daquele edital, que já não serve.
//      É o grosso do banco: o ruído da captação (inclusive os não-obra).
//   2. Encerrado e COM vínculo → a linha FICA; só o `raw_payload` é zerado. O
//      usuário continua vendo a obra salva e a proposta; nós largamos o dump cru
//      (uso interno, o maior peso por linha).
//
// Os PDFs do cofre (bytea) NÃO entram aqui: são documentos do usuário, não lixo
// por idade. Somem quando ele exclui a conta (cascade da T-102).

// Dias após o encerramento para descartar um edital sem vínculo (decisão do dono:
// 90). Configurável para calibrar sem deploy.
const DIAS_PADRAO = 90;

// Apaga em lotes: um DELETE de dezenas de milhares de linhas segura lock e
// memória no free tier. Cada passada é uma transação curta.
const LOTE = 2000;

export interface ResultadoRetencao {
  /** Editais encerrados e sem vínculo, removidos de vez. */
  removidos: number;
  /** Editais com vínculo cujo dump cru foi descartado (a linha ficou). */
  payloadsLimpos: number;
}

/** Data de corte: o que encerrou ANTES disto é passado. Pura (§3.3). */
export function dataCorte(now: Date, dias: number): Date {
  return new Date(now.getTime() - dias * 24 * 60 * 60 * 1000);
}

@Injectable()
export class RetencaoService {
  private readonly logger = new Logger(RetencaoService.name);

  constructor(
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    private readonly config: ConfigService,
  ) {}

  private get dias(): number {
    const v = Number(this.config.get('RETENCAO_DIAS', DIAS_PADRAO));
    return Number.isFinite(v) && v > 0 ? v : DIAS_PADRAO;
  }

  // Semanal. Como todo @Cron no free tier (o serviço hiberna), NÃO é confiável —
  // por isso existe o gatilho manual (POST /retencao/run), igual à captação.
  @Cron(CronExpression.EVERY_WEEK)
  async cronSemanal(): Promise<void> {
    await this.executar().catch((e) =>
      this.logger.error(`Retenção (cron) falhou: ${this.msg(e)}`),
    );
  }

  async executar(now: Date = new Date()): Promise<ResultadoRetencao> {
    const corte = dataCorte(now, this.dias);
    const removidos = await this.removerSemVinculo(corte);
    const payloadsLimpos = await this.limparPayloadDosVinculados(corte);
    if (removidos > 0 || payloadsLimpos > 0) {
      this.logger.log(
        `Retenção (${this.dias}d): ${removidos} edital(is) removido(s), ` +
          `${payloadsLimpos} payload(s) descartado(s).`,
      );
    }
    return { removidos, payloadsLimpos };
  }

  // "Encerrado" = o prazo de proposta já passou do corte. Sem prazo informado
  // (null = desconhecido, favor recall do §3.3), cai na data de publicação: um
  // edital publicado há mais de 90 dias e cujo prazo nunca soubemos é passado.
  private readonly ENCERRADO = `COALESCE("prazo_proposta", "data_publicacao") < $1`;

  // Vínculo = alguém salvou (T-31) ou montou proposta (T-61). É o que separa
  // "lixo nosso" de "trabalho do usuário".
  private readonly SEM_VINCULO = `
    NOT EXISTS (SELECT 1 FROM "favoritos" f WHERE f.edital_id = "editais".id)
    AND NOT EXISTS (SELECT 1 FROM "propostas" p WHERE p.edital_id = "editais".id)`;

  // Apaga em lotes até não sobrar nada elegível.
  private async removerSemVinculo(corte: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const linhas = await this.editais.query<{ id: string }[]>(
        `DELETE FROM "editais"
         WHERE id IN (
           SELECT id FROM "editais"
           WHERE ${this.ENCERRADO} AND ${this.SEM_VINCULO}
           LIMIT ${LOTE}
         )
         RETURNING id`,
        [corte],
      );
      total += linhas.length;
      if (linhas.length < LOTE) return total;
    }
  }

  // Zera o dump cru dos encerrados COM vínculo — a linha (e o trabalho do
  // usuário em cima dela) fica intacta.
  private async limparPayloadDosVinculados(corte: Date): Promise<number> {
    const linhas = await this.editais.query<{ id: string }[]>(
      `UPDATE "editais"
       SET "raw_payload" = NULL
       WHERE ${this.ENCERRADO}
         AND "raw_payload" IS NOT NULL
         AND NOT (${this.SEM_VINCULO})
       RETURNING id`,
      [corte],
    );
    return linhas.length;
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
